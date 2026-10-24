import { useMemo } from 'react';
import { useSimulationStore } from './simulationStore';
import { bucketAlarms, type AlarmBuckets } from '@/utils/alarms';
import type { SimFrame } from '@/types/simulation';

/**
 * Derived alarm buckets for the current frame.
 *
 * Memoised on the stable `frame.alarms` array reference, so this hook never
 * triggers the "getSnapshot should be cached" loop that a filtering selector
 * would cause.
 */
export function useAlarmBuckets(): AlarmBuckets {
  const alarms = useSimulationStore((state) => state.frame.alarms);
  return useMemo(() => bucketAlarms(alarms), [alarms]);
}

/** Convenience selector for the whole frame. */
export function useFrame(): SimFrame {
  return useSimulationStore((state) => state.frame);
}
