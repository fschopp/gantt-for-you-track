declare module 'dhtmlx-gantt/codebase/ext/dhtmlxgantt_tooltip' {
  // Source code: https://github.com/DHTMLX/gantt/blob/6.2.0/codebase/sources/ext/dhtmlxgantt_tooltip.js

  global {
    // 'dhtml-gantt' is not a proper module, so it adds to the global namespace

    interface GanttConfigOptions {
      /**
       * Not documented, but apparently: Show tooltips even if `gantt.config.touch` is true.
       */
      // The only reference I can find to this property is this:
      // https://github.com/DHTMLX/gantt/blob/6.2.0/codebase/sources/ext/dhtmlxgantt_tooltip.js#L129
      touch_tooltip: boolean;
    }
  }

  class TooltipManager {
    /**
     * Adds a tooltip for the specified Gantt element. It is a more simplified version of the attach() method.
     *
     * @param config Configuration object.
     * @param config.selector A CSS-selector of the Gantt element to add a tooltip to.
     * @param config.html A template for the tooltip.
     * @param config.html.event A native mouse event.
     * @param config.html.node The HTML node and returns a string with a template.
     * @param config.global Defines whether the module listens to mouse events on the whole page (true) or only inside a
     *     gantt element (false). By default the option is set to false.
     */
    public tooltipFor(config: {selector: string; html: (event: Event, node: HTMLElement) => string | undefined;
        global?: boolean}): void;

    /**
     * Removes tooltip.
     *
     * @param selector The CSS selector of a Gantt element.
     */
    public detach(selector: string): void;
  }
}
