/**
 * A [dhtmlxGantt task](https://docs.dhtmlx.com/gantt/desktop__loading.html#dataproperties) object.
 *
 * Note that dhtmlxGantt is more liberal in the types than specified here. This definition is more restrictive for our
 * needs.
 */
import { App, assignApp, createApp, jsonable, Plain } from '@fschopp/project-planning-ui-for-you-track';
import S, { DataSignal } from 's-js';

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
   * Base URL of the YouTrack instance where this issue was retrieved from.
   */
  youTrackBaseUrl: string;

  /**
   * Whether the issue has been resolved in YouTrack.
   */
  isResolved: boolean;

  /**
   * The YouTrack-internal ID of the type of the issue.
   */
  typeId: string;

  /**
   * The YouTrack-internal ID of the state of the issue.
   */
  stateId: string;
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

export interface GanttApp extends App {
  readonly zoom: DataSignal<number>;
}

export function createGanttApp(): GanttApp {
  return {
    ...createApp(),
    zoom: jsonable(S.value(0)),
  };
}

export function assignGanttApp(ganttApp: GanttApp, plain: Plain<GanttApp>) {
  S.freeze(() => {
    assignApp(ganttApp, plain);
    ganttApp.zoom(plain.zoom);
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
