import { ProjectPlan } from '@fschopp/project-planning-for-you-track';
import { AppCtrl, ExtendedProjectPlan } from '@fschopp/project-planning-ui-for-you-track';
import { strict as assert } from 'assert';
import S from 's-js';
import { ConcreteScale, GanttApp, GanttData, GanttLink, GanttTask, Scale } from './gantt-model';

export class GanttCtrl {
  public readonly appCtrl: AppCtrl;
  public readonly ganttData: () => GanttData | undefined;
  public readonly scale: () => ConcreteScale;
  public readonly projectPlan: () => ProjectPlan | undefined;
  public readonly planDate: () => Date | undefined;

  constructor(
      public readonly ganttApp: GanttApp
  ) {
    this.appCtrl = new AppCtrl(ganttApp);
    this.ganttData = S(() => {
      const extendedProjectPlan: ExtendedProjectPlan | undefined = this.appCtrl.extendedProjectPlan();
      return extendedProjectPlan === undefined
          ? undefined
          : ganttDataFrom(extendedProjectPlan);
    });
    this.scale = S(() => scaleFromZoom(this.ganttApp.zoom()));
    this.projectPlan = S(() => opt(this.appCtrl.extendedProjectPlan(), 'plan'));
    this.planDate = S(() => {
      const timestamp: number | undefined = opt(this.appCtrl.extendedProjectPlan(), 'youTrackTimestamp');
      return timestamp === undefined
          ? undefined
          : new Date(timestamp);
    });
  }
}

function opt<T, P extends keyof T>(obj: T | undefined, property: P): T[P] | undefined {
  return obj === undefined
      ? undefined
      : obj[property];
}

function ganttDataFrom({plan, settings}: ExtendedProjectPlan): GanttData {
  const tasks: GanttTask[] = [];
  const links: GanttLink[] = [];
  const parents =
      new Set<string>(plan.issues.map((issue) => issue.parent).filter((parent) => parent.length > 0));
  for (const issue of plan.issues) {
    const ganttTask: GanttTask = {
      youTrackBaseUrl: settings.youTrackBaseUrl,
      id: issue.id,
      text: issue.summary,
      ...issue.issueActivities.length === 0
          ? {
              unscheduled: true,
            }
          : {
              start_date: new Date(issue.issueActivities[0].start),
              end_date: new Date(issue.issueActivities[issue.issueActivities.length - 1].end),
            },
      isResolved: issue.resolved < Number.MAX_SAFE_INTEGER,
      typeId: coalesce<string>(issue.customFields[settings.typeFieldId], ''),
      stateId: coalesce<string>(issue.customFields[settings.stateFieldId], ''),
    };
    if (issue.parent.length > 0) {
      ganttTask.parent = issue.parent;
    }
    for (const dependency of issue.dependencies) {
      links.push({
        id: links.length,
        source: dependency,
        target: issue.id,
        type: '0',
      });
    }
    tasks.push(ganttTask);
    if (issue.issueActivities.length > 1 && !parents.has(issue.id)) {
      // If the issue is a parent, we cannot use the split rendering. Unfortunately, dhtmlxGantt does not
      // distinguish between parts and children
      ganttTask.render = 'split';
      issue.issueActivities.forEach((issueActivity, index, array) => {
        tasks.push({
          youTrackBaseUrl: settings.youTrackBaseUrl,
          id: `${issue.id}/${index + 1}`,
          text: `${issue.summary} (${index + 1} of ${array.length})`,
          start_date: new Date(issueActivity.start),
          end_date: new Date(issueActivity.end),
          parent: issue.id,
          isResolved: ganttTask.isResolved,
          typeId: ganttTask.typeId,
          stateId: ganttTask.stateId,
        });
      });
    }
  }
  // Each node wraps a GanttTask (in the original order), together with additional information (like subtasks).
  const nodeArray: Node<GanttTask>[] = Array.from(toNodeIterator(tasks, (task) => task.id, (task) => task.parent));
  propagateMinMaxTimestamps(nodeArray.filter((node) => node.parent === undefined));
  return {
    data: Array.from(inTopologicalOrder(nodeArray)),
    links,
  };
}

interface Node<V> {
  value: V;
  parent: Node<V> | undefined;
  children: Node<V>[];
  visited: boolean;
}


function toNodeIterator<K, V>(
    list: V[],
    keyFn: (value: V) => K,
    parentFn: (value: V) => K | undefined
): IterableIterator<Node<V>> {
  const keyToNodeMap: Map<K, Node<V>> = list
      .reduce((map, value) => map.set(keyFn(value), {
        value,
        parent: undefined,
        children: [],
        visited: false,
      }), new Map<K, Node<V>>());
  for (const node of keyToNodeMap.values()) {
    const parentKey: K | undefined = parentFn(node.value);
    if (parentKey !== undefined) {
      node.parent = keyToNodeMap.get(parentKey)!;
      node.parent.children.push(node);
    }
  }
  return keyToNodeMap.values();
}

function* inTopologicalOrder<V>(nodes: Iterable<Node<V>>): IterableIterator<V> {
  let currentIterator: Iterator<Node<V>> | undefined = nodes[Symbol.iterator]();
  const stack: Iterator<Node<V>>[] = [];
  while (currentIterator !== undefined) {
    const iteratorResult = currentIterator.next();
    if (iteratorResult.done) {
      currentIterator = stack.pop();
    } else {
      const node: Node<V> = iteratorResult.value;
      if (node.parent === undefined || node.parent.visited) {
        node.visited = true;
        yield iteratorResult.value.value;
        if (node.children.length > 0) {
          stack.push(currentIterator);
          currentIterator = node.children[Symbol.iterator]();
        }
      }
    }
  }
}

function propagateMinMaxTimestamps(nodes: Iterable<Node<GanttTask>>): void {
  type ParentAndIterator = [Node<GanttTask>, Iterator<Node<GanttTask>>];

  let currentIterator: Iterator<Node<GanttTask>> | undefined = nodes[Symbol.iterator]();
  const stack: ParentAndIterator[] = [];
  while (currentIterator !== undefined) {
    const iteratorResult: IteratorResult<Node<GanttTask>> = currentIterator.next();
    let currentNode: Node<GanttTask> | undefined;
    if (iteratorResult.done) {
      const parentAndIterator: ParentAndIterator | undefined = stack.pop();
      [currentNode, currentIterator] = parentAndIterator === undefined
          ? [undefined, undefined]
          : parentAndIterator;
    } else {
      currentNode = iteratorResult.value;
      if (currentNode.children.length > 0 && currentNode.value.render !== 'split') {
        stack.push([currentNode, currentIterator]);
        currentIterator = currentNode.children[Symbol.iterator]();
        continue;
      }
    }

    if (currentNode !== undefined && currentNode.parent !== undefined) {
      // We have visited currentNode and all its descendants. Do the post-order-traversal action now.
      const parent: GanttTask = currentNode.parent.value;
      const child: GanttTask = currentNode.value;
      parent.start_date =
          minDate(parent.start_date, child.start_date, (left, right) => left.getTime() - right.getTime());
      parent.end_date = minDate(parent.end_date, child.end_date, (left, right) => right.getTime() - left.getTime());
    }
  }
}

function minDate(left: Date | undefined, right: Date | undefined,
    comparison: (left: Date, right: Date) => number): Date | undefined {
  if (left !== undefined && right !== undefined) {
    return comparison(left, right) < 0
        ? left
        : right;
  } else if (left !== undefined) {
    return left;
  } else if (right !== undefined) {
    return right;
  } else {
    return undefined;
  }
}

function scaleFromZoom(zoom: number): ConcreteScale {
  assert(zoom >= 0, 'Invalid arguments');

  interface ExtendedScale extends Scale {
    maxDays: number;
  }

  const widthPerDay: number = Math.exp(zoom / 100);
  const MIN_WIDTH = 25;
  const scales: ExtendedScale[] = [
    {unit: 'day', format: '%j', subscales: [{unit: 'week', step: 1, date: '%M %Y, week #%W'}], maxDays: 1},
    {unit: 'week', format: 'Week #%W', subscales: [{unit: 'month', step: 1, date: '%M %Y'}], maxDays: 7},
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
