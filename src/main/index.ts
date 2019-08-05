import {
  assignProjectPlanningSettings,
  createProjectPlanningAppComputation,
  ProjectPlanningAppComputation,
  Router,
} from '@fschopp/project-planning-ui-for-you-track';
import S from 's-js';
import { GanttCtrl } from './gantt-ctrl';
import { assignGanttApp, createGanttApp, GanttApp } from './gantt-model';
import { GanttStyleElement, GanttView } from './gantt-view';

S.root(() => {
  const app: GanttApp = createGanttApp();
  const appComputation: ProjectPlanningAppComputation = createProjectPlanningAppComputation();

  const ctrl = GanttCtrl.createDefaultGanttCtrl(app, appComputation);
  new Router(
      app,
      (plainApp) => assignGanttApp(app, plainApp),
      (plainSettings) => assignProjectPlanningSettings(app.settings, plainSettings)
  );

  document.head.append(GanttStyleElement({ctrl}));
  document.body.append(...GanttView({app, appComputation, ctrl}).children);
});

// The purpose of the exports is currently only documentation of the relevant elements.
export * from './gantt-ctrl';
export * from './gantt-model';
export * from './gantt-view';
