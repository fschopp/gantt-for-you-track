import { ExtendedProjectPlan } from '@fschopp/project-planning-ui-for-you-track';
import S, { DataSignal } from 's-js';

export default class MockAppCtrl {
  public static readonly sharedExtendedProjectPlan: DataSignal<ExtendedProjectPlan | undefined> = S.value(undefined);

  public readonly extendedProjectPlan: () => ExtendedProjectPlan | undefined = MockAppCtrl.sharedExtendedProjectPlan;
}
