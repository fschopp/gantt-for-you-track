import {
  AlertsView,
  ExtendedProjectPlan,
  NavView,
  Page,
  Plain,
  Settings,
  SettingsView,
  WarningsView,
  withClassIff,
  YouTrackMetadata,
  YouTrackRest,
} from '@fschopp/project-planning-ui-for-you-track';
import 'dhtmlx-gantt';
import 'dhtmlx-gantt/codebase/ext/dhtmlxgantt_marker';
import S, { DataSignal } from 's-js';
// noinspection ES6UnusedImports
import * as Surplus from 'surplus';
import data from 'surplus-mixin-data';
import { GanttCtrl } from './gantt-ctrl';
import { ConcreteScale, GanttData, GanttTask } from './gantt-model';

export function GanttStyleElement({ctrl}: {ctrl: GanttCtrl}): HTMLElement {
  return <style>
        {cssFrom(ctrl.appCtrl.extendedProjectPlan(), ctrl.appCtrl.youTrackMetadata())}
      </style>;
}

export function GanttView({ctrl}: {ctrl: GanttCtrl}): Element[] {
  return Array.from((<div>
      <NavView className="flex-grow-0 flex-shrink-0" appCtrl={ctrl.appCtrl} />
      {/* See https://stackoverflow.com/a/36247448 for "overflow-hidden" */}
      <main class="position-relative overflow-hidden flex-shrink-1 flex-grow-1 border-top"
            role="main">
        <div class="overflow-hidden position-absolute fill-parent d-flex flex-column"
             fn={withClassIff(() => ctrl.ganttApp.currentPage() !== Page.HOME, 'invisible')}>
          <div class="d-flex align-items-center border-bottom px-3 py-2">
            <label for="zoom" class="mb-0">🔍</label>
            <input class="custom-range ml-2" type="range" id="zoom" min="0" max="425" step="1"
                   fn={data(ctrl.ganttApp.zoom)}/>
          </div>
          <GanttContainer className="overflow-hidden flex-shrink-1 flex-grow-1 gantt-container" ctrl={ctrl} />
        </div>
        <div class="overflow-auto position-absolute fill-parent"
             fn={withClassIff(() => ctrl.ganttApp.currentPage() !== Page.WARNINGS, 'invisible')}>
          <div class="container">
            <h2 class="mt-3">Project Plan Warnings</h2>
            <WarningsView projectPlan={ctrl.projectPlan} />
          </div>
        </div>
        <div class="overflow-auto position-absolute fill-parent"
             fn={withClassIff(() => ctrl.ganttApp.currentPage() !== Page.SETTINGS, 'invisible')}>
          <div class="container">
            <h2 class="mt-3">Settings</h2>
            <SettingsView ctrl={ctrl.appCtrl.settingsCtrl} />
          </div>
        </div>
      </main>
      <AlertsView ctrl={ctrl.appCtrl.alertCtrl} />
    </div>).children);
}

declare global {
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

function GanttContainer({className, ctrl}: {className: string, ctrl: GanttCtrl}): HTMLElement {
  const ganttContainer = <div class={className}/>;

  bindGanttToData(ctrl.ganttData);
  bindGanttToScale(ctrl.scale);
  bindGanttToPlanDate(ctrl.planDate);

  const width: DataSignal<number> = S.value(100);
  const timelineBackground =
      <svg class="gantt-timeline-background">
        <defs>
          <pattern id="timeline-background-pattern" x="-1.5" y="0" width={width()} height="100"
                   patternUnits="userSpaceOnUse">
            <line class="gantt-timeline-background-line" x1="1" y1="0" x2="1" y2="100" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="url(#timeline-background-pattern)" />
      </svg>;
  gantt.attachEvent('onDataRender', () => {
    // We need to ensure that this event is not triggered multiple times during an S.js transaction. Otherwise, the
    // width may be updated to different values, which is illegal during a single S.js transaction.
    width((ganttContainer.getElementsByClassName('gantt_scale_cell')[0]! as HTMLElement).offsetWidth);
    if (!timelineBackground.isConnected) {
      ganttContainer.getElementsByClassName('gantt_task_bg')[0]!.prepend(timelineBackground);
    }
  });
  gantt.attachEvent('onGanttLayoutReady', () => {
    // FIXME. This is somewhat of a hack in order to avoid a "double" border of 2px where the resize handle is supposed
    // to be. See above.
    gantt.$layout.$cells[0]._getBorderSizes =
        () => ({top: 0, right: 0, bottom: 0, left: 0, horizontal: 0, vertical: 0});
  });
  // Prevent event propagation if the user clicked on a link in the task description. If zoomed in, the view may
  // otherwise jump to the beginning of the task activity, which is undesirable.
  gantt.attachEvent('onTaskClick', (ignoredId, event: MouseEvent) => !(event.target instanceof HTMLAnchorElement));

  gantt.templates.task_class = getTaskCssClass;
  gantt.templates.grid_row_class = getTaskCssClass;

  gantt.config.columns = [{
    name: 'text',
    label: 'Task name',
    width: '*',
    template: (task: GanttTask) =>
        `<a href="${task.youTrackBaseUrl}youtrack/issue/${task.id}" target="_blank">${task.id}</a>: ${task.text}`,
    tree: true,
  }];
  gantt.config.readonly = true;
  gantt.config.show_task_cells = false;
  gantt.config.show_unscheduled = true;
  gantt.config.layout = {
    cols: [{
      css: 'undo_gantt_layout_cell_border_right',
      gravity: 1,
      rows: [{
        view: 'grid',
        scrollY: 'scrollVer',
      }],
    }, {
      // By setting property 'resizer' to true, no div would actually be created. Therefore, there is a 1px border
      // between the grid and the timeline. Unfortunately 1px is hard-coded, so if we remove property 'resizer' and
      // instead add [HTML as inner view](https://docs.dhtmlx.com/gantt/desktop__layout_config.html#htmlasinnerview),
      // then 2 right borders would be visible, giving 2px in total. Since 1px border width is hard-coded, there seem
      // to be only hacky ways of obtaining a 1px resizable border. One is using CSS to remove the 1px right border from
      // the grid, and then make sure the dhtmlxGantt size calculation never includes the border either. This is what
      // we do below in the 'onGanttLayoutReady' event handler.
      html: '<div class="horizontal-divider-resize-handle"></div>',
      width: 1,
    }, {
      gravity: 4,
      rows: [{
        view: 'timeline',
        scrollX: 'scrollHor',
        scrollY: 'scrollVer',
      }, {
        view: 'scrollbar',
        id: 'scrollHor',
      }],
    }, {
      view: 'scrollbar',
      id: 'scrollVer',
    }],
  };

  gantt.init(ganttContainer);
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
  function updatemarker() {
    const currentPlanDate: Date | undefined = planDate();
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
}

function getTaskCssClass(ignoredStartDate: Date, ignoredEndDate: Date, task: GanttTask): string {
  const cssClasses = [['type', task.typeId], ['state', task.stateId]]
        .filter(([_, id]) => id.length > 0)
        .map(([kind, id]) => `${kind}-${id}`);
  if (task.isResolved) {
    cssClasses.push('resolved-issue');
  }
  return cssClasses.join(' ');
}

function cssFrom(extendedProjectPlan: ExtendedProjectPlan | undefined,
    youTrackMetadata: YouTrackMetadata | undefined): string {
  let css: string = '';
  if (extendedProjectPlan === undefined || youTrackMetadata === undefined) {
    return css;
  }

  const settings: Plain<Settings> = extendedProjectPlan.settings;
  for (const customField of youTrackMetadata.customFields) {
    if (customField.id === settings.typeFieldId) {
      for (const enumBundleElement of
          (customField.fieldDefaults as YouTrackRest.EnumBundleCustomFieldDefaults).bundle.values) {
        css += `
            .gantt_task_line.type-${enumBundleElement.id} {
              background-color: ${enumBundleElement.color.background};
            }
            `;
        css += `
            .gantt_task_line.type-${enumBundleElement.id} .gantt_task_content {
              color: ${enumBundleElement.color.foreground};
            }
            `;
      }
    }
  }
  return css;
}
