import { ExtendedProjectPlan } from '@fschopp/project-planning-ui-for-you-track';
import S, { DataSignal } from 's-js';

export default class MockProjectPlanningAppCtrl {
  public static readonly sharedExtendedProjectPlan: DataSignal<ExtendedProjectPlan | undefined> = S.value(undefined);

  public static createDefaultProjectPlanningAppCtrl(): MockProjectPlanningAppCtrl {
    return new MockProjectPlanningAppCtrl();
  }

  public readonly extendedProjectPlan: () => ExtendedProjectPlan | undefined =
      MockProjectPlanningAppCtrl.sharedExtendedProjectPlan;
}
