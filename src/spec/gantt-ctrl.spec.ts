// Since some (transpiled) dependencies define async functions, we need the Babel polyfill.
// See also: https://github.com/babel/babel/issues/5085
import 'babel-polyfill';
// This import is needed for mocking module '@fschopp/project-planning-ui-for-you-track', so it needs to come first!
import MockAppCtrl from '../mocks/mock-app-ctrl';

import { IssueActivity, YouTrackIssue } from '@fschopp/project-planning-for-you-track';
import * as ProjectPlanningUiForYouTrack from '@fschopp/project-planning-ui-for-you-track';
import { ExtendedProjectPlan } from '@fschopp/project-planning-ui-for-you-track';
import S from 's-js';
import { GanttCtrl } from '../main/gantt-ctrl';
import { createGanttApp, GanttTask } from '../main/gantt-model';


type ProjectPlanningUiForYouTrack = typeof ProjectPlanningUiForYouTrack;
jest.mock('@fschopp/project-planning-ui-for-you-track', () => {
  const actualModule: ProjectPlanningUiForYouTrack = jest.requireActual('@fschopp/project-planning-ui-for-you-track');
  return {
    ...actualModule,
    AppCtrl: MockAppCtrl,
  };
});

test('generates GanttData if AppCtrl.extendedProjectPlan signal changes', () => {
//  mockAppCtrlConstructor.mockReturnValue(MockAppCtrl);
  const gantApp = createGanttApp();
  let ganttCtrl: GanttCtrl | undefined;
  S.root(() => {
    ganttCtrl = new GanttCtrl(gantApp);
  });
  if (ganttCtrl === undefined) {
    throw new Error('ganttCtrl should be defined');
  }

  expect(ganttCtrl.ganttData()).toEqual(undefined);

  const settings: any = {};
  const idToExternalContributorName = new Map<string, string>();
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
    settings,
    youTrackTimestamp: 42,
    idToExternalContributorName,
  };
  MockAppCtrl.sharedExtendedProjectPlan(extendedProjectPlan);
  const ganttTasks: GanttTask[] = ganttCtrl.ganttData()!.data;
  expect(ganttTasks.map((ganttTask) => ganttTask.id)).toEqual(['b', 'a', 'c']);
  expect([ganttTasks[0].start_date!.getTime(), ganttTasks[0].end_date!.getTime()]).toEqual([2, 6]);
  expect([ganttTasks[1].start_date!.getTime(), ganttTasks[1].end_date!.getTime()]).toEqual([2, 5]);
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
