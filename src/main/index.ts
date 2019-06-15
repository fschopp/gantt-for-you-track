import { Router } from '@fschopp/project-planning-ui-for-you-track';
import S from 's-js';
import { GanttCtrl } from './gantt-ctrl';
import { assignGanttApp, createGanttApp, GanttApp } from './gantt-model';
import { GanttStyleElement, GanttView } from './gantt-view';

S.root(() => {
  const ganttApp: GanttApp = createGanttApp();
  Router.create(ganttApp, (savedState) => assignGanttApp(ganttApp, savedState));
  const ganttCtrl = new GanttCtrl(ganttApp);
  document.head.append(GanttStyleElement({ctrl: ganttCtrl}));
  document.body.append(...GanttView({ctrl: ganttCtrl}));
});

// The purpose of the exports is currently only documentation of the relevant elements.
export * from './gantt-ctrl';
export * from './gantt-model';
export * from './gantt-view';
