// Some dependencies define async functions, yet they are transpiled to target older browsers, too. For that reason,
// they rely on the 'regenerator-runtime' (without including it themselves). We need to provide it therefore.
import 'regenerator-runtime';
// This import is needed for mocking module '@fschopp/project-planning-ui-for-you-track', so it needs to come first!
import MockProjectPlanningAppCtrl from '../mocks/mock-project-planning-app-ctrl';

import { IssueActivity, YouTrackIssue } from '@fschopp/project-planning-for-you-track';
import * as ProjectPlanningUiForYouTrack from '@fschopp/project-planning-ui-for-you-track';
import {
  createProjectPlanningAppComputation,
  ExtendedProjectPlan,
  ProjectPlanningAppComputation,
} from '@fschopp/project-planning-ui-for-you-track';
import S from 's-js';
import { GanttCtrl } from '../main/gantt-ctrl';
import { createGanttApp, GanttTask, GanttTaskType } from '../main/gantt-model';


type ProjectPlanningUiForYouTrack = typeof ProjectPlanningUiForYouTrack;
jest.mock('@fschopp/project-planning-ui-for-you-track', () => {
  const actualModule: ProjectPlanningUiForYouTrack = jest.requireActual('@fschopp/project-planning-ui-for-you-track');
  return {
    ...actualModule,
    ProjectPlanningAppCtrl: MockProjectPlanningAppCtrl,
  };
});

test('generates GanttData if AppCtrl.extendedProjectPlan signal changes', () => {
  const app = createGanttApp();
  const appComputation: ProjectPlanningAppComputation = createProjectPlanningAppComputation();

  let ganttCtrl: GanttCtrl | undefined;
  S.root(() => {
    ganttCtrl = GanttCtrl.createDefaultGanttCtrl(app, appComputation);
  });
  if (ganttCtrl === undefined) {
    throw new Error('ganttCtrl should be defined');
  }

  expect(ganttCtrl.ganttData()).toEqual(undefined);

  const settings: Partial<ExtendedProjectPlan['settings']> = {
    youTrackBaseUrl: 'http://fake-youtrack/',
  };
  const idToContributorIdx = new Map<string, number>();
  const extendedProjectPlan: ExtendedProjectPlan = {
    plan: {
      issues: [
        {
          ...defaultIssue(),
          id: 'a',
          parent: 'b',
          issueActivities: [{...defaultActivity(), start: 2, end: 5}],
        },
        {
          ...defaultIssue(),
          id: 'b',
          issueActivities: [{...defaultActivity(), start: 3, end: 6}],
        },
        {
          ...defaultIssue(),
          id: 'c',
        },
      ],
      warnings: [],
    },
    settings: settings as ExtendedProjectPlan['settings'],
    youTrackTimestamp: 42,
    idToContributorIdx,
  };
  MockProjectPlanningAppCtrl.sharedExtendedProjectPlan(extendedProjectPlan);
  const ganttTasks: GanttTask[] = ganttCtrl.ganttData()!.data;
  expect(ganttTasks.map((ganttTask) => [ganttTask.issue.id, ganttTask.ganttTaskType])).toEqual([
    ['b', GanttTaskType.MAIN],
    ['b', GanttTaskType.PARENT_ONLY],
    ['a', GanttTaskType.MAIN],
    ['c', GanttTaskType.MAIN],
  ]);
  expect(ganttTasks.map((task) => (task.start_date !== undefined && task.end_date !== undefined)
      ? [task.start_date.getTime(), task.end_date.getTime()]
      : undefined
  )).toEqual([
    [2, 6],
    [3, 6],
    [2, 5],
    undefined,
  ]);
});

function defaultIssue(): YouTrackIssue {
  return {
    id: 'MOCK',
    summary: 'mock issue',
    issueActivities: [],
    resolved: Number.MAX_SAFE_INTEGER,
    state: '',
    assignee: '',
    parent: '',
    customFields: {},
    remainingEffortMs: 60 * 60 * 1000,
    remainingWaitTimeMs: 0,
    splittable: false,
    dependencies: [],
  };
}

function defaultActivity(): IssueActivity {
  return {
    assignee: '',
    start: 0,
    end: 0,
    isWaiting: false,
  };
}
