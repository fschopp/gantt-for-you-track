import {
  groupByIntervalAndWaitStatus,
  IssueNode,
  makeForest,
  MultiAssigneeIssueActivity,
  ProjectPlan,
  traverseIssueForest,
  YouTrackIssue,
} from '@fschopp/project-planning-for-you-track';
import {
  Contributor,
  ContributorKind,
  ExtendedProjectPlan,
  Plain,
  ProjectPlanningAppComputation,
  ProjectPlanningAppCtrl,
  ProjectPlanningSettings,
  unreachableCase,
  YouTrackMetadata,
  YouTrackRest,
} from '@fschopp/project-planning-ui-for-you-track';
import { EnumBundleElement } from '@fschopp/project-planning-ui-for-you-track/dist/es6/youtrack-rest';
import { strict as assert } from 'assert';
import S from 's-js';
import {
  ConcreteScale,
  GanttApp,
  GanttContributor,
  GanttData,
  GanttIssue,
  GanttLink,
  GanttTask,
  GanttTaskType,
  Scale,
} from './gantt-model';

export class GanttCtrl {
  public readonly scale: () => ConcreteScale;
  public readonly projectPlan: () => ProjectPlan | undefined;
  public readonly planDate: () => Date | undefined;

  /**
   * Signal carrying a map from user ID, as used for the {@link ExtendedProjectPlan}, to the YouTrack user information.
   */
  public readonly relevantUsers: () => Map<string, GanttContributor>;

  /**
   * Signal carrying the project plan converted to {@link GanttData}.
   */
  public readonly ganttData: () => GanttData | undefined;

  /**
   * Signal carrying a map from type ID to the enum bundle element.
   */
  public readonly typeBundleElements: () => Map<string, EnumBundleElement>;

  public static createDefaultGanttCtrl(app: GanttApp, appComputation: ProjectPlanningAppComputation): GanttCtrl {
    const projectPlanningAppCtrl: ProjectPlanningAppCtrl =
      ProjectPlanningAppCtrl.createDefaultProjectPlanningAppCtrl(app, appComputation);
    return new GanttCtrl(app, appComputation, projectPlanningAppCtrl);
  }

  public constructor(
      app: GanttApp,
      appComputation: ProjectPlanningAppComputation,
      public readonly projectPlanningAppCtrl: ProjectPlanningAppCtrl
  ) {
    this.scale = S(() => scaleFromZoom(app.zoom()));
    this.projectPlan = S(() => opt(projectPlanningAppCtrl.extendedProjectPlan(), 'plan'));
    this.planDate = S(() => {
      const timestamp: number | undefined = opt(projectPlanningAppCtrl.extendedProjectPlan(), 'youTrackTimestamp');
      return timestamp === undefined
          ? undefined
          : new Date(timestamp);
    });
    const emptyMap = new Map<string, GanttContributor>();
    this.relevantUsers = S(() => {
      const youTrackMetadata: YouTrackMetadata | undefined = appComputation.youTrackMetadata();
      const extendedProjectPlan: ExtendedProjectPlan | undefined = projectPlanningAppCtrl.extendedProjectPlan();
      return (youTrackMetadata === undefined || extendedProjectPlan === undefined)
          ? emptyMap
          : makeIdToGanttContributorMap(extendedProjectPlan.settings, extendedProjectPlan.plan,
              extendedProjectPlan.idToContributorIdx, youTrackMetadata);
    });
    this.ganttData = S(() => {
      const extendedProjectPlan: ExtendedProjectPlan | undefined = projectPlanningAppCtrl.extendedProjectPlan();
      const relevantUsers: Map<string, GanttContributor> = this.relevantUsers();
      return extendedProjectPlan === undefined
          ? undefined
          : ganttDataFrom(extendedProjectPlan, relevantUsers);
    });
    this.typeBundleElements = S(() => {
      const youTrackMetadata: YouTrackMetadata | undefined = appComputation.youTrackMetadata();
      const extendedProjectPlan: ExtendedProjectPlan | undefined = projectPlanningAppCtrl.extendedProjectPlan();
      const map = new Map<string, EnumBundleElement>();
      if (youTrackMetadata === undefined || extendedProjectPlan === undefined) {
        return map;
      }

      const settings: Plain<ProjectPlanningSettings> = extendedProjectPlan.settings;
      for (const customField of youTrackMetadata.customFields) {
        if (customField.id === settings.typeFieldId) {
          for (const enumBundleElement of
              (customField.fieldDefaults as YouTrackRest.EnumBundleCustomFieldDefaults).bundle.values) {
            map.set(enumBundleElement.id, enumBundleElement);
          }
        }
      }
      return map;
    });
  }
}


interface Interval {
  start: number;
  end: number;
}

/**
 * Issue extended by mapping it to a corresponding {@link GanttTask}.
 */
interface ExtendedIssue extends YouTrackIssue {
  /**
   * Issue activities grouped by interval and wait status.
   */
  multiAssigneeIssueActivities: MultiAssigneeIssueActivity[];

  /**
   * The own time span of just this issue, without sub-issues.
   */
  ownTimespan?: Interval;

  /**
   * The overall time span of this issue with sub-issues.
   */
  overallTimespan?: Interval;
}

/**
 * From a set K of properties of some type T, extract those whose property values are assignable to U.
 */
type AssignableProperty<T, K extends keyof T, U> = K extends (T[K] extends U ? K : never) ? K : never;

/**
 * From the properties of some type T, extract those whose property values are assignable to U.
 */
type AssignableProperties<T, U> = AssignableProperty<T, keyof T, U>;

const NO_INDEX: number = -1;

function opt<T, P extends keyof T>(obj: T | undefined, property: P): T[P] | undefined {
  return obj === undefined
      ? undefined
      : obj[property];
}

function ganttDataFrom({plan, settings, youTrackTimestamp}: ExtendedProjectPlan,
    relevantUsers: Map<string, GanttContributor>): GanttData {
  // First pass over the issues: Build a forest/tree
  const issueForest: Iterable<IssueNode<ExtendedIssue>> = makeForest(makeExtendedIssuesArray(plan.issues));

  // Second pass (post-order traversal): Propagate start and end times to the overall timespan of each parent issue.
  traverseIssueForest(issueForest, () => { /* no-op */ }, (node) => {
    const parentNode: IssueNode<ExtendedIssue> | undefined = node.parent;
    if (parentNode !== undefined) {
      const issue: ExtendedIssue = node.issue;
      const parentIssue: ExtendedIssue = parentNode.issue;
      if (parentIssue.overallTimespan === undefined) {
        // It's important to create a new object here!
        parentIssue.overallTimespan = node.issue.overallTimespan === undefined
            ? undefined
            : {...node.issue.overallTimespan};
      } else {
        parentIssue.overallTimespan.start =
            Math.min(parentIssue.overallTimespan.start, coalesce(opt(issue.overallTimespan, 'start'), Infinity));
        parentIssue.overallTimespan.end =
            Math.max(parentIssue.overallTimespan.end, coalesce(opt(issue.overallTimespan, 'end'), -Infinity));
      }
    }
  });

  // Third pass (pre-order traversal): Build the flat array of GanttTask objects. It needs to be topologically sorted
  // (i.e., parents first). (dhtmlxGantt complains if parents are referenced before they are defined.)
  const tasks: GanttTask[] = [];
  const links: GanttLink[] = [];
  traverseIssueForest(issueForest, (node) => {
    const issue = node.issue;
    const multiAssigneeIssueActivities: MultiAssigneeIssueActivity[] = issue.multiAssigneeIssueActivities;
    const ganttIssue: GanttIssue = {
      id: issue.id,
      url: issueUrl(settings.youTrackBaseUrl, issue.id),
      isResolved: issue.resolved < Number.MAX_SAFE_INTEGER,
      typeId: coalesce<string>(issue.customFields[settings.typeFieldId], ''),
      stateId: coalesce<string>(issue.customFields[settings.stateFieldId], ''),
      // It is possible that issue.assignee === '', in which case get() will return undefined, as appropriate
      assignee: relevantUsers.get(issue.assignee),
      // The information is not yet available, so the following will be updated later.
      hasSubIssues: node.children.length > 0,
      totalNumActivities: issue.multiAssigneeIssueActivities.filter((activity) => !activity.isWaiting).length,
    };
    const mainGanttTask: GanttTask = {
      id: ganttTaskId(issue, GanttTaskType.MAIN, NO_INDEX),
      text: issue.summary,
      ...issue.overallTimespan === undefined
          ? {
              unscheduled: true,
              isInFuture: false,
            }
          : {
              start_date: new Date(issue.overallTimespan.start),
              end_date: new Date(issue.overallTimespan.end),
              isInFuture: issue.overallTimespan.end > youTrackTimestamp,
            },
      ganttTaskType: GanttTaskType.MAIN,
      contributors: multiAssigneeIssueActivities.length === 1
          ? assigneesToContributors(multiAssigneeIssueActivities[0].assignees, relevantUsers)
          : [],
      isWaiting: multiAssigneeIssueActivities.length === 1
          ? multiAssigneeIssueActivities[0].isWaiting
          : false,
      index: NO_INDEX,
      issue: ganttIssue,
    };
    if (issue.parent.length > 0) {
      mainGanttTask.parent = issue.parent;
    }
    tasks.push(mainGanttTask);

    let parentOnlyGanttTask: GanttTask | undefined;
    if (doesNeedParentOnlyTask(node)) {
      // The main GanttTask in this case will show the total time span of the current parent issue *and* all its
      // sub-issues. We therefore add another GanttTask that shows the activities of just the current parent issue
      // itself.
      assert(issue.ownTimespan !== undefined,
          'post-condition of doesNeedParentOnlyTask() is that ownTimespan is defined');
      const ownTimespan: Interval = issue.ownTimespan!;

      parentOnlyGanttTask = {
        ...cloneGanttTask(mainGanttTask),
        id: ganttTaskId(issue, GanttTaskType.PARENT_ONLY, NO_INDEX),
        start_date: new Date(ownTimespan.start),
        end_date: new Date(ownTimespan.end),
        parent: ganttTaskId(issue, GanttTaskType.MAIN, NO_INDEX),
        ganttTaskType: GanttTaskType.PARENT_ONLY,
        isInFuture: ownTimespan.end > youTrackTimestamp,
      };
      tasks.push(parentOnlyGanttTask);
    }

    if (multiAssigneeIssueActivities.length > 1) {
      const splitGanttTask: GanttTask = parentOnlyGanttTask !== undefined
          ? parentOnlyGanttTask
          : mainGanttTask;
      splitGanttTask.render = 'split';
      let nonWaitingIndex: number = 0;
      for (let i = 0; i < multiAssigneeIssueActivities.length; ++i) {
        const issueActivity: MultiAssigneeIssueActivity = multiAssigneeIssueActivities[i];
        tasks.push({
          ...mainGanttTask,
          id: ganttTaskId(node.issue, GanttTaskType.ACTIVITY, i),
          start_date: new Date(issueActivity.start),
          end_date: new Date(issueActivity.end),
          parent: ganttTaskId(issue, splitGanttTask.ganttTaskType, NO_INDEX),
          ganttTaskType: GanttTaskType.ACTIVITY,
          contributors: assigneesToContributors(issueActivity.assignees, relevantUsers),
          isWaiting: issueActivity.isWaiting,
          isInFuture: issueActivity.end > youTrackTimestamp,
          index: issueActivity.isWaiting
              ? NO_INDEX
              : nonWaitingIndex,
        });
        nonWaitingIndex += +!issueActivity.isWaiting;
      }
    }

    node.dependencies.forEach((dep) => links.push(makeLink(links.length, dep.issue, issue)));
  });
  return {data: tasks, links};
}

function scaleFromZoom(zoom: number): ConcreteScale {
  assert(zoom >= 0, 'Invalid arguments');

  interface ExtendedScale extends Scale {
    maxDays: number;
  }

  const widthPerDay: number = Math.exp(zoom / 100);
  const MIN_WIDTH = 25;
  const scales: ExtendedScale[] = [
    {unit: 'day', format: '%j', subscales: [{unit: 'month', step: 1, date: '%M %Y'}], maxDays: 1},
    {unit: 'week', format: '%j', subscales: [{unit: 'month', step: 1, date: '%M %Y'}], maxDays: 7},
    {unit: 'month', format: '%M', subscales: [{unit: 'year', step: 1, date: '%Y'}], maxDays: 31},
    {unit: 'year', format: '%Y', subscales: [], maxDays: 366},
  ];
  assert(widthPerDay >= 1 && widthPerDay * Math.max(...scales.map(({maxDays}) => maxDays)) >= MIN_WIDTH);
  const scale: ExtendedScale = scales.find(({maxDays}) => widthPerDay * maxDays >= MIN_WIDTH)!;
  return {
    ...scale,
    minColumnWidth: Math.floor(widthPerDay * scale.maxDays),
  };
}

function coalesce<T>(left: T | undefined, right: T): T {
  return left !== undefined
      ? left
      : right;
}

/**
 * Returns whether a {@link GanttTask} with type {@link GanttTaskType.PARENT_ONLY} is required.
 */
function doesNeedParentOnlyTask(node: IssueNode<ExtendedIssue>): boolean {
  const issue: ExtendedIssue = node.issue;
  assert(issue.multiAssigneeIssueActivities.length === 0 ||
      (issue.ownTimespan !== undefined && issue.overallTimespan !== undefined),
      'If there are issue activities, then there there are well-defined time spans.');
  return (
      node.children.length > 0 && (
          issue.multiAssigneeIssueActivities.length > 1 || (
              issue.multiAssigneeIssueActivities.length === 1 && (
                  // See assert for explanation of typecast.
                  issue.ownTimespan!.start !== issue.overallTimespan!.start ||
                  issue.ownTimespan!.end !== issue.overallTimespan!.end
              )
          )
      )
  );
}

function makeExtendedIssuesArray(issues: YouTrackIssue[]): ExtendedIssue[] {
  return issues.map((issue): ExtendedIssue => {
    const multiAssigneeIssueActivities: MultiAssigneeIssueActivity[] =
        groupByIntervalAndWaitStatus(issue.issueActivities);
    const extendedIssue: ExtendedIssue = {
      ...issue,
      multiAssigneeIssueActivities,
    };
    if (multiAssigneeIssueActivities.length > 0) {
      extendedIssue.ownTimespan = {
        start: multiAssigneeIssueActivities[0].start,
        end: multiAssigneeIssueActivities[multiAssigneeIssueActivities.length - 1].end,
      };
      // This will be updated later!
      extendedIssue.overallTimespan = {...extendedIssue.ownTimespan};
    }
    return extendedIssue;
  });
}

function cloneGanttTask(task: GanttTask): GanttTask {
  assert((task.start_date === undefined) === (task.end_date === undefined),
      'Task start time must be defined if and only if end time is defined, too.');

  function cloneDateProperty(property: AssignableProperties<GanttTask, Date | undefined>): void {
    const originalDate: Date | undefined = task[property];
    if (originalDate !== undefined) {
      clonedTask[property] = new Date(originalDate.getTime());
    }
  }

  const clonedTask: GanttTask = {
    ...task,
    contributors: [...task.contributors],
  };
  cloneDateProperty('start_date');
  cloneDateProperty('end_date');
  // All other properties are either immutable (string, boolean, etc.) or meant to be shared (GanttContributor,
  // GanttIssue, etc.).
  return clonedTask;
}

function ganttTaskId(issue: YouTrackIssue, type: GanttTaskType, activityIndex: number): string {
  assert((type === GanttTaskType.ACTIVITY) === (activityIndex >= 0), 'Invalid arguments');

  switch (type) {
    case GanttTaskType.MAIN: return issue.id;
    case GanttTaskType.PARENT_ONLY: return `${issue.id}/only`;
    case GanttTaskType.ACTIVITY: return `${issue.id}/${activityIndex}`;
    default: return unreachableCase(type);
  }
}

function makeIdToGanttContributorMap(settings: Plain<ProjectPlanningSettings>, plan: ProjectPlan,
    idToContributorIdx: Map<string, number>, youTrackMetadata: YouTrackMetadata): Map<string, GanttContributor> {
  interface YouTrackUser {
    name: string;
    avatarUrl: string;
    index: number;
  }
  const youTrackUsers = youTrackMetadata.users
      .reduce((map, user, index) =>
          map.set(user.id, {
            name: user.fullName,
            // Note that user.avatarUrl is an absolute path starting with '/'. It will therefore only keep the origin of
            // youTrackMetadata.baseUrl (as desired).
            avatarUrl: new URL(user.avatarUrl, youTrackMetadata.baseUrl).toString(),
            index}
          ),
          new Map<string, YouTrackUser>()
      );
  const idToGanttContributor: Map<string, GanttContributor> = new Map();

  function processId(id: string): void {
    if (id.length === 0 || idToGanttContributor.has(id)) {
      return;
    }

    const contributorIdx: number | undefined = idToContributorIdx.get(id);
    if (contributorIdx !== undefined) {
      assert(settings.contributors[contributorIdx] !== undefined, 'ExtendedProjectPlan is inconsistent');
      const contributor: Plain<Contributor> = settings.contributors[contributorIdx]!;
      let nameAndAvatarUrl;
      if (contributor.type === ContributorKind.EXTERNAL) {
        nameAndAvatarUrl = {
          name: contributor.name,
        };
      } else {
        const youTrackUser: YouTrackUser | undefined = youTrackUsers.get(id);
        nameAndAvatarUrl = {
          name: opt(youTrackUser, 'name'),
          avatarUrl: opt(youTrackUser, 'avatarUrl'),
        };
      }
      idToGanttContributor.set(id, {
        isExternal: contributor.type === ContributorKind.EXTERNAL,
        id,
        ...nameAndAvatarUrl,
        ordinal: contributorIdx,
      });
    } else {
      // YouTrack user ID that does not belong to any of the configured contributors.
      const youTrackUser: YouTrackUser | undefined = youTrackUsers.get(id);
      idToGanttContributor.set(id, {
        isExternal: false,
        id,
        name: opt(youTrackUser, 'name'),
        avatarUrl: opt(youTrackUser, 'avatarUrl'),
        ordinal: youTrackUser !== undefined
            ? youTrackUser.index + settings.contributors.length
            : Number.MAX_SAFE_INTEGER,
      });
    }
  }

  for (const issue of plan.issues) {
    processId(issue.assignee);
    issue.issueActivities.map((activity) => activity.assignee).forEach(processId);
  }
  return idToGanttContributor;
}

function makeLink(id: number, from: ExtendedIssue, to: ExtendedIssue): GanttLink {
  let target: string = to.id;
  if (to.multiAssigneeIssueActivities.length > 1 && from.multiAssigneeIssueActivities.length > 0) {
    const fromEnd = from.multiAssigneeIssueActivities[from.multiAssigneeIssueActivities.length - 1].end;
    if (fromEnd > to.multiAssigneeIssueActivities[0].start) {
      const index: number = to.multiAssigneeIssueActivities.findIndex(
          (issueActivity) => issueActivity.start >= fromEnd && !issueActivity.isWaiting);
      if (index >= 0) {
        target = ganttTaskId(to, GanttTaskType.ACTIVITY, index);
      }
    }
  }
  return {
    id,
    source: from.id,
    target,
    type: '0',
  };
}

function issueUrl(youTrackBaseUrl: string, issueId: string): string {
  assert(youTrackBaseUrl.endsWith('/'));
  return `${youTrackBaseUrl}issue/${issueId}`;
}

function assigneesToContributors(assignees: string[], relevantUsers: Map<string, GanttContributor>):
    GanttContributor[] {
  // Note that groupByIntervalAndWaitStatus() assumes that assignee === '' represents an unknown assignee. It
  // therefore does not omit activities with empty assignee. Here, empty assignees can only occur for historic
  // activities, so omitting them is the right thing to do.
  return assignees
    .filter((assignee) => assignee.length > 0)
    .map((assignee) => requireDefined(relevantUsers.get(assignee)))
    .sort((first, second) => first.ordinal - second.ordinal);
}

function requireDefined<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Undefined value where not expected.');
  }
  return value;
}
