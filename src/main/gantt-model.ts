/**
 * A [dhtmlxGantt task](https://docs.dhtmlx.com/gantt/desktop__loading.html#dataproperties) object.
 *
 * Note that dhtmlxGantt is more liberal in the types than specified here. This definition is more restrictive for our
 * needs.
 */
import {
  App,
  assignProjectPlanningApp,
  createProjectPlanningApp,
  jsonable,
  Plain,
  ProjectPlanningSettings,
} from '@fschopp/project-planning-ui-for-you-track';
import S, { DataSignal } from 's-js';

/**
 * A contributor to a Gantt task.
 */
export interface GanttContributor {
  /**
   * Whether this contributor is an external contributor.
   */
  isExternal: boolean;

  /**
   * If {@link isExternal} is false, the YouTrack-internal ID of the user (contributor).
   */
  id: string;

  /**
   * The name of the contributor.
   *
   * If for some reason the name is unknown (for instance, because YouTrack metadata changed), this property is
   * `undefined`.
   */
  name: string | undefined;

  /**
   * If {@link isExternal} is false, the URL to the user avatar.
   */
  avatarUrl?: string;

  /**
   * The index of the corresponding contributor in {@link ProjectPlanningSettings.contributors}.
   *
   * This property allows sorting of contributors according to the order in the settings.
   */
  ordinal: number;
}

/**
 * The type of a {@link GanttTask}.
 */
export enum GanttTaskType {
  /**
   * The {@link GanttTask} is the main task object; that is, it corresponds to a `YouTackIssue`. It shows the total time
   * span of all `IssueActivity` objects, *including* those of sub-issues.
   */
  MAIN = 'main',

  /**
   * The {@link GanttTask} corresponds to a parent `YouTrackIssue`. It shows the total time span of its own
   * `IssueActivity` objects (*excluding* sub-issues).
   */
  PARENT_ONLY = 'parent_only',

  /**
   * The {@link GanttTask} corresponds to an `IssueActivity` of a `YouTrackIssue` that has more than one activity.
   *
   * If the issue has no sub-issues, then the main {@link GanttTask} has {@link GanttTask.render} set to `'split'`.
   * Otherwise, there is is another {@link GanttTask} with type {@link PARENT_ONLY} that has {@link GanttTask.render}
   * set to `'split'`. In either case, the {@link GanttTask.parent} property of the current {@link GanttTask} is set to
   * the split task object.
   */
  ACTIVITY = 'activity',
}

/**
 * A [dhtmlxGantt task](https://docs.dhtmlx.com/gantt/desktop__loading.html#dataproperties) object.
 *
 * If the {@link GanttTask.render} property of the parent task is `'split'`, then the current instance only represents a
 * task fragment (and it corresponds to an `IssueActivity`).
 */
export interface GanttTask {
  /**
   * The task id.
   */
  id: string;

  /**
   * The task text.
   */
  text: string;

  /**
   * Indicates whether the task is unscheduled (without a start date). See the dhtmlxGantt documentation of
   * [Unscheduled Tasks](https://docs.dhtmlx.com/gantt/desktop__unscheduled_tasks.html).
   */
  unscheduled?: boolean;

  /**
   * The date when a task is scheduled to begin.
   */
  start_date?: Date;

  /**
   * The date when a task is scheduled to end.
   */
  end_date?: Date;

  /**
   * The id of the parent task.
   */
  parent?: string;

  /**
   * Specifies whether the task branch will be opened initially (to show child tasks).
   */
  open?: boolean;

  /**
   * See the dhtmlxGantt
   * [Split Task Example](https://docs.dhtmlx.com/gantt/samples/04_customization/11_split_task.html).
   */
  render?: 'split';

  // All fields below are custom fields not defined by dhtmlxGantt

  /**
   * The type of this object.
   */
  ganttTaskType: GanttTaskType;

  /**
   * Contributors for this task or task fragment.
   *
   * If the YouTrack issue is not splittable and the task fragment extends into the future, then this is a singleton
   * array containing {@link assignee}. Otherwise, this array may have an arbitrary size. For fragments in the past, it
   * may also be empty.
   */
  contributors: GanttContributor[];

  /**
   * Whether this task or task fragment represents wait time.
   */
  isWaiting: boolean;

  /**
   * Whether this task or task fragment is (at least partially) in the future.
   */
  isInFuture: boolean;

  /**
   * The 0-based index of this task fragment among all *non-waiting* task fragment; or -1 if {@link ganttTaskType} is
   * not {@link GanttTaskType.ACTIVITY}.
   *
   * See also {@link GanttIssue.totalNumActivities}.
   */
  index: number;

  /**
   * The issue.
   *
   * Note that a {@link GanttTask} can also represent issue activities, hence there is a 1:n relationship between
   * {@link GanttIssue} and {@link GanttTask}.
   */
  issue: GanttIssue;
}

/**
 * An issue with all relevant information for a Gantt chart.
 */
export interface GanttIssue {
  /**
   * The issue ID.
   */
  id: string;

  /**
   * URL of this issue.
   */
  url: string;

  /**
   * Whether the corresponding issue has been resolved in YouTrack.
   */
  isResolved: boolean;

  /**
   * The YouTrack-internal ID of the type of the corresponding issue.
   */
  typeId: string;

  /**
   * The YouTrack-internal ID of the state of the corresponding issue.
   */
  stateId: string;

  /**
   * The YouTrack assignee of the corresponding issue (if known).
   */
  assignee?: GanttContributor;

  /**
   * Whether the corresponding issue has children (sub-issues).
   */
  hasSubIssues: boolean;

  /**
   * Total number of *non-waiting* activities.
   *
   * See also {@link GanttTask.index}.
   */
  totalNumActivities: number;
}

/**
 * A [dhtmlxGantt link](https://docs.dhtmlx.com/gantt/desktop__loading.html#dataproperties) object.
 */
export interface GanttLink {
  /**
   * The link id.
   *
   * We assign numeric IDs dynamically at load time. The IDs have no correspondence to the issue tracker.
   */
  id: number;

  /**
   * The id of a task that the dependency will start from.
   */
  source: string;

  /**
   * The id of a task that the dependency will end with.
   */
  target: string;

  /**
   * The dependency type. The available values are stored in the
   * [`gantt.config.links`](https://docs.dhtmlx.com/gantt/api__gantt_links_config.html) object.
   *
   * We currently only support finish-to-start links.
   */
  type: '0';
}

/**
 * Argument type for [`gantt.parse()`](https://docs.dhtmlx.com/gantt/api__gantt_parse.html).
 */
export interface GanttData {
  /**
   * Gantt tasks.
   */
  data: GanttTask[];

  /**
   * Links between Gantt tasks.
   */
  links: GanttLink[];
}

export interface GanttApp extends App<ProjectPlanningSettings> {
  readonly zoom: DataSignal<number>;
  readonly issueListWidth: DataSignal<number>;
}

export function createGanttApp(): GanttApp {
  return {
    ...createProjectPlanningApp(),
    zoom: jsonable(S.value(0)),
    issueListWidth: jsonable(S.value(250)),
  };
}

export function assignGanttApp(ganttApp: GanttApp, plain: Plain<GanttApp>) {
  S.freeze(() => {
    assignProjectPlanningApp(ganttApp, plain);
    ganttApp.zoom(plain.zoom);
    ganttApp.issueListWidth(plain.issueListWidth);
  });
}

export type ScaleUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export interface Scale {
  unit: ScaleUnit;
  format: string;
  subscales: Subscale[];
}

export interface Subscale {
  unit: ScaleUnit;
  step: number;
  date: string;
}

export interface ConcreteScale extends Scale {
  minColumnWidth: number;
}
