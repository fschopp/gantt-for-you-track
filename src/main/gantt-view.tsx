// tslint:disable-next-line:no-reference
/// <reference path="third-party-types.d.ts"/>

import { EnumBundleElement } from '@fschopp/project-planning-for-you-track/dist/es6/you-track-rest';
import {
  Action,
  AlertsView,
  NavView,
  Page,
  projectPlanningActionLabel,
  ProjectPlanningAppComputation,
  ProjectPlanningSettingsView,
  WarningsView,
  withClassIff,
} from '@fschopp/project-planning-ui-for-you-track';
import 'dhtmlx-gantt';
import 'dhtmlx-gantt/codebase/ext/dhtmlxgantt_marker';
import 'dhtmlx-gantt/codebase/ext/dhtmlxgantt_tooltip';
import { TooltipManager } from 'dhtmlx-gantt/codebase/ext/dhtmlxgantt_tooltip';
import S, { DataSignal } from 's-js';
import * as Surplus from 'surplus'; // lgtm [js/unused-local-variable]
import data from 'surplus-mixin-data';
import { GanttCtrl } from './gantt-ctrl';
import { ConcreteScale, GanttApp, GanttContributor, GanttData, GanttTask, GanttTaskType } from './gantt-model';

export function GanttStyleElement({ctrl}: {ctrl: GanttCtrl}): HTMLElement {
  return (
      <style>
        {cssFrom(ctrl.typeBundleElements(), ctrl.relevantUsers())}
      </style>
  );
}

export function GanttView(
    {app, appComputation, ctrl}:
      {
        app: GanttApp;
        appComputation: ProjectPlanningAppComputation;
        ctrl: GanttCtrl;
      }
    ): HTMLElement {
  return (
      <div>
        <NavView appName={appComputation.name} currentPage={app.currentPage} progress={appComputation.progress}
                 numWarnings={ctrl.projectPlanningAppCtrl.numWarnings}
                 isActionBtnVisible={() =>
                     isActionButtonVisible(ctrl.projectPlanningAppCtrl.action(), app.currentPage())}
                 actionBtnLabel={() => projectPlanningActionLabel(ctrl.projectPlanningAppCtrl.action())}
                 actionSignal={appComputation.doAction} />
        {/* See https://stackoverflow.com/a/36247448 for "overflow-hidden" */}
        <main class="position-relative overflow-hidden flex-shrink-1 flex-grow-1 border-top"
              role="main">
          <div class="overflow-hidden position-absolute fill-parent d-flex flex-column"
               fn={withClassIff(() => app.currentPage() !== Page.HOME, 'invisible')}>
            <div class="d-flex align-items-center border-bottom px-3 py-2 flex-shrink-0 flex-grow-0">
              <label for="zoom" class="mb-0">🔍</label>
              <input class="custom-range ml-2" type="range" id="zoom" min="0" max="425" step="1"
                     fn={data(app.zoom)}/>
            </div>
            <GanttContainer className="overflow-hidden flex-shrink-1 flex-grow-1 gantt-container" ctrl={ctrl}
                            gridWidth={app.issueListWidth} />
          </div>
          <div class="overflow-auto position-absolute fill-parent"
               fn={withClassIff(() => app.currentPage() !== Page.WARNINGS, 'invisible')}>
            <div class="container">
              <h2 class="mt-3">Project Plan Warnings</h2>
              <WarningsView projectPlan={ctrl.projectPlan} />
            </div>
          </div>
          <div class="overflow-auto position-absolute fill-parent"
               fn={withClassIff(() => app.currentPage() !== Page.SETTINGS, 'invisible')}>
            <form class="container was-validated">
              <h2 class="mt-3">Settings</h2>
              <ProjectPlanningSettingsView settings={app.settings} ctrl={ctrl.projectPlanningAppCtrl.settingsCtrl}
                                           connectSignal={appComputation.connect}
                                           invalidCounter={ctrl.projectPlanningAppCtrl.appCtrl.invalidCounter} />
            </form>
          </div>
        </main>
        <AlertsView alerts={appComputation.alerts} ctrl={ctrl.projectPlanningAppCtrl.appCtrl.alertsCtrl} />
      </div>
  );
}


const MIN_GRID_WIDTH: number = 25;

declare global {
  // FIXME: This hack is unfortunate. Obviously, it would be great to use only public API.
  // noinspection JSUnusedGlobalSymbols
  interface GanttStatic {
    $layout: {
      $cells: {
        _getBorderSizes(): {
          top: number,
          right: number,
          bottom: number,
          left: number,
          horizontal: number,
          vertical: number,
        },
      }[],
    };
  }
}

function GanttContainer(
    {className, ctrl, gridWidth}: {className: string; ctrl: GanttCtrl; gridWidth: DataSignal<number>}): HTMLElement {
  const ganttContainer = <div class={className}/>;

  bindGanttToData(ctrl.ganttData);
  bindGanttToScale(ctrl.scale);
  bindGanttToPlanDate(ctrl.planDate);

  gantt.templates.task_class = getTaskCssClass;
  gantt.templates.task_text = getTaskText;
  gantt.templates.grid_row_class = getTaskCssClass;
  gantt.templates.tooltip_text = getTaskTooltipHtml;

  // Hack in order to avoid a "double" border of 2px where the resize handle is supposed to be. See where
  // gantt.config.layout is set.
  gantt.attachEvent('onGanttLayoutReady', () =>
    gantt.$layout.$cells[0]._getBorderSizes =
        () => ({top: 0, right: 0, bottom: 0, left: 0, horizontal: 0, vertical: 0})
  );
  // Prevent event propagation if the user clicked on a link in the task description. If zoomed in, the view may
  // otherwise jump to the beginning of the task activity, which is undesirable.
  gantt.attachEvent('onTaskClick', (ignoredId, event: MouseEvent) => !(event.target instanceof HTMLAnchorElement));
  // https://docs.dhtmlx.com/gantt/api__gantt_attachevent.html says:
  // "Event handlers are processed in the same order that they were attached."
  // This should work in our favor, as it means the event handler installed by the tooltip extension (see
  // https://github.com/DHTMLX/gantt/blob/6.2.0/codebase/sources/ext/dhtmlxgantt_tooltip.js#L125) runs before (and not
  // after) the following:
  gantt.attachEvent('onGanttReady', setupTooltips);

  gantt.config.columns = [{
    name: 'text',
    label: 'Task name',
    width: '*',
    template: (task: GanttTask) =>
        (task.ganttTaskType === GanttTaskType.PARENT_ONLY
            ? '(own activities)'
            : `<a href="${task.issue.url}" target="_blank">${task.issue.id}</a>: ${task.text}`),
    tree: true,
  }];
  gantt.config.readonly = true;
  gantt.config.show_unscheduled = true;
  gantt.config.layout = {
    cols: [
      {
        // This is somewhat of a hack. The CSS class does not exist, but the key is that dhtmlxGantt that the css
        // property is a strict "superstring" of "gantt_layout_cell_border_right". See:
        // https://github.com/DHTMLX/gantt/blob/6.2.0/codebase/sources/dhtmlxgantt.js#L28550, called from
        // https://github.com/DHTMLX/gantt/blob/6.2.0/codebase/sources/dhtmlxgantt.js#L20142
        css: 'undo_gantt_layout_cell_border_right',
        width: S.sample(gridWidth),
        view: 'grid',
        scrollY: 'scrollVer',
      },
      {
        // By setting property 'resizer' to true, no div would actually be created. Therefore, there is a 1px border
        // between the grid and the timeline. Unfortunately 1px is hard-coded, so if we remove property 'resizer' and
        // instead add [HTML as inner view](https://docs.dhtmlx.com/gantt/desktop__layout_config.html#htmlasinnerview),
        // then 2 right borders would be visible, giving 2px in total. Since 1px border width is hard-coded, there seem
        // to be only hacky ways of obtaining a 1px resizable border. One is using CSS to remove the 1px right border
        // from the grid, and then make sure the dhtmlxGantt size calculation never includes the border either. This is
        // what we do below in the 'onGanttLayoutReady' event handler.
        html: '<div class="horizontal-divider-resize-handle"></div>',
        width: 1,
      },
      {
        rows: [
          {
            view: 'timeline',
            scrollX: 'scrollHor',
            scrollY: 'scrollVer',
          },
          {
            view: 'scrollbar',
            id: 'scrollHor',
          },
        ],
      },
      {
        view: 'scrollbar',
        id: 'scrollVer',
      },
    ],
  };

  gantt.init(ganttContainer);
  bindGanttGridToWidth(
      gridWidth, ganttContainer.getElementsByClassName('horizontal-divider-resize-handle').item(0) as HTMLDivElement);
  return ganttContainer;
}

function bindGanttToData(ganttData: () => GanttData | undefined): void {
  let scheduledReload = false;
  function reload() {
    const currentGanttData: GanttData | undefined = S.sample(ganttData);
    if (scheduledReload && currentGanttData !== undefined) {
      gantt.clearAll();
      gantt.parse(currentGanttData);
    }
    scheduledReload = false;
  }
  // 2nd and 3rd arguments: Undefined seed value, and skip the initial run.
  S.on(ganttData, () => {
    if (!scheduledReload) {
      // With the deferred invocation we can guarantee that the function runs outside of any S.js computation.
      window.setTimeout(reload);
    }
    scheduledReload = true;
  }, undefined, true);
}

function bindGanttToScale(scale: () => ConcreteScale): void {
  let scheduledRender = false;
  function render() {
    const currentScale = scale();
    if (scheduledRender) {
      gantt.config.scale_unit = currentScale.unit;
      gantt.config.date_scale = currentScale.format;
      gantt.config.subscales = currentScale.subscales;
      gantt.config.min_column_width = currentScale.minColumnWidth;

      if (currentScale.unit === 'day') {
        gantt.templates.scale_cell_class = (date) => cssFromDayOfWeek(date.getDay());
        gantt.templates.timeline_cell_class = (ignoredTask, date) => cssFromDayOfWeek(date.getDay());
      } else {
        gantt.templates.timeline_cell_class = gantt.templates.scale_cell_class = () => '';
      }

      gantt.render();
    }
    scheduledRender = false;
  }
  S.on(scale, () => {
    if (!scheduledRender) {
      // With the deferred invocation we can guarantee that the function runs outside of any S.js computation.
      window.setTimeout(render);
    }
    scheduledRender = true;
  });
}

function bindGanttToPlanDate(planDate: () => Date | undefined): void {
  let markerId: string | undefined;
  let scheduledUpdateMarker = false;
  function updatemarker(): void {
    const currentPlanDate: Date | undefined = S.sample(planDate);
    if (scheduledUpdateMarker) {
      if (currentPlanDate === undefined) {
        if (markerId !== undefined) {
          gantt.deleteMarker(markerId);
          markerId = undefined;
        }
      } else {
        if (markerId === undefined) {
          markerId = gantt.addMarker({
            start_date: currentPlanDate,
            css: 'today',
            title: 'Time the project plan was created',
            text: 'Now',
          });
        } else {
          const marker = gantt.getMarker(markerId);
          marker.start_date = currentPlanDate;
          gantt.updateMarker(markerId);
        }
      }
    }
    scheduledUpdateMarker = false;
  }
  S.on(planDate, () => {
    if (!scheduledUpdateMarker) {
      window.setTimeout(updatemarker);
    }
    scheduledUpdateMarker = true;
  });
  // gantt.clearAll() removes markers: https://docs.dhtmlx.com/gantt/api__gantt_clearall.html
  // We therefore need to recreate them afterwards. The appropriate event to listen for is 'onClear'. See:
  // https://github.com/DHTMLX/gantt/blob/6.2.0/codebase/sources/dhtmlxgantt.js#L11102
  gantt.attachEvent('onClear', () => {
    markerId = undefined;
    scheduledUpdateMarker = true;
    updatemarker();
  });
}

/**
 * Two-way binds the given width signal with the Gantt grid width.
 */
export function bindGanttGridToWidth(width: DataSignal<number>, element: HTMLElement): void {
  function setWidth(newWidth: number): void {
    const oldWidth = gantt.config.grid_width;
    gantt.config.grid_width = newWidth;
    if (oldWidth !== newWidth) {
      gantt.render();
    }
  }

  S(() => setWidth(width()));

  let startX: number;
  let startWidth: number;
  let isResizing = false;

  function onMouseMove(event: MouseEvent): void {
    setWidth(Math.max(MIN_GRID_WIDTH, startWidth + (event.pageX - startX)));
  }

  function onMouseUp(): void {
    isResizing = false;

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    width(gantt.config.grid_width);
  }

  element.addEventListener('mousedown', (event: MouseEvent) => {
    startX = event.pageX;
    startWidth = S.sample(width);
    isResizing = true;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function getTaskCssClass(ignoredStartDate: Date, ignoredEndDate: Date, task: GanttTask): string {
  const cssClasses = [['type', task.issue.typeId], ['state', task.issue.stateId]]
      .filter(([_, id]) => id.length > 0)
      .map(([kind, id]) => `${kind}-${id}`);
  if (task.ganttTaskType === GanttTaskType.MAIN && task.issue.hasSubIssues) {
    cssClasses.push('parent');
  }
  if (task.issue.isResolved) {
    cssClasses.push('resolved-issue');
  }
  if (task.isWaiting) {
    cssClasses.push('waiting');
  }
  return cssClasses.join(' ');
}

function getTaskText(start: Date, end: Date, task: GanttTask): string {
  if (task.isWaiting) {
    return 'Wait time';
  } else if (task.ganttTaskType === GanttTaskType.ACTIVITY) {
    return `${task.text} (${task.index + 1} of ${task.issue.totalNumActivities})`;
  } else {
    return task.text;
  }
}

function getTaskTooltipHtml(start: Date, end: Date, task: GanttTask): string {
  let html: string =
      `<b>${task.isWaiting ? 'Wait time for issue' : 'Issue'}:</b> ${task.text}<br/>`;
  if (task.index >= 0) {
    html +=
      `<b>Activity:</b> ${task.index + 1} of ${task.issue.totalNumActivities}<br/>`;
  }
  html +=
      `<b>Start Date:</b> ${gantt.templates.tooltip_date_format(start)}<br/>` +
      `<b>End Date:</b> ${gantt.templates.tooltip_date_format(end)}<br/>`;

  function addUser(user: GanttContributor): void {
    if (user.isExternal) {
      html += `<div class="youtrack-user">${user.name}</div>`;
    } else {
      html += `<div class="youtrack-user youtrack-user-${user.id}">${user.name}</div>`;
    }
  }

  if (task.issue.assignee === undefined) {
    html += '<b>No assignee in YouTrack</b><br/>';
  } else {
    html += '<b>Assignee in YouTrack:</b>';
    addUser(task.issue.assignee);
  }

  if (task.isInFuture && task.contributors.length > 0) {
    html += '<b>Planned contributors:</b>';
    task.contributors.forEach(addUser);
  }
  return html;
}

function setupTooltips(): void {
  // Remove the built-in tooltip handler that was previously installed here:
  // https://github.com/DHTMLX/gantt/blob/6.2.0/codebase/sources/ext/dhtmlxgantt_tooltip.js#L125
  // Note that the detach function is relatively simple: It does not interpret the selector. Instead, it is important
  // that we pass the exact same string here that was previously installed.
  const tooltipManager: TooltipManager = gantt.ext.tooltips;
  tooltipManager.detach(`[${gantt.config.task_attribute}]:not(.gantt_task_row)`);
  tooltipManager.tooltipFor({
    selector: `.gantt_bar_task[${gantt.config.task_attribute}]`,
    html(event: Event): string | undefined {
      // Copied and slightly modified from
      // https://github.com/DHTMLX/gantt/blob/6.2.0/codebase/sources/ext/dhtmlxgantt_tooltip.js#L129,
      // which is identical to the suggestion on the documentation:
      // https://docs.dhtmlx.com/gantt/desktop__tooltips.html#customizationoftooltipbehavior
      if (gantt.config.touch && !gantt.config.touch_tooltip) {
        return;
      }
      const targetTaskId: string | number = gantt.locate(event);
      if (gantt.isTaskExists(targetTaskId)) {
        const task: GanttTask = gantt.getTask(targetTaskId);
        // The selector is such that we only end up here if the task has start and end dates.
        return gantt.templates.tooltip_text(task.start_date!, task.end_date!, task);
      }
    },
  });
}

function cssFrom(typeBundleElements: Map<string, EnumBundleElement>, relevantUsers: Map<string, GanttContributor>):
    string {
  let css: string = '';
  for (const enumBundleElement of typeBundleElements.values()) {
    css +=
        `.gantt_task_line.type-${enumBundleElement.id} {\n` +
        `  background-color: ${enumBundleElement.color.background};\n` +
        '}\n' +
        `.gantt_task_line.type-${enumBundleElement.id} .gantt_task_content {\n` +
        `  color: ${enumBundleElement.color.foreground};\n` +
        '}\n';
  }
  for (const relevantUser of relevantUsers.values()) {
    if (relevantUser.avatarUrl !== undefined) {
      css +=
          `.youtrack-user-${relevantUser.id} {\n` +
          `  background-image: url("${relevantUser.avatarUrl}");\n` +
          '}\n';
    }
  }
  return css;
}

function isActionButtonVisible(action: Action, page: Page): boolean {
  return (action !== Action.NOTHING && action !== Action.COMPLETE_SETTINGS) ||
      (action === Action.COMPLETE_SETTINGS && page !== Page.SETTINGS);
}

function cssFromDayOfWeek(day: number): string {
  return day === 0 || day === 6
      ? 'weekend'
      : '';
}
