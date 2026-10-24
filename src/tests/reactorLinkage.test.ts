import { describe, expect, it } from 'vitest';
import {
  COMPONENT_LIST,
  COMPONENT_REGISTRY,
  FAULT_AFFECTED_COMPONENTS,
  FAULT_PROPAGATION,
  componentFromEquipmentId,
  componentFromSlug,
  faultedComponents,
} from '@/reactor/componentRegistry';

/**
 * 3D ↔ device linkage contract tests (G.9).
 *
 * The registry is the single mapping used by the 3D scene, the equipment list,
 * the page jump and the fault overlay; these tests pin that contract.
 */
describe('3D component registry', () => {
  it('covers all nine documented device ids with unique slugs', () => {
    expect(COMPONENT_LIST).toHaveLength(9);
    const slugs = COMPONENT_LIST.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(
      expect.arrayContaining([
        'plasma',
        'vacuum-vessel',
        'tf-coils',
        'pf-coils',
        'central-solenoid',
        'divertor',
        'cryostat',
        'neutral-beam-injector',
        'coolant-manifold',
      ]),
    );
  });

  it('maps slugs to component ids (including legacy singular forms)', () => {
    expect(componentFromSlug('tf-coils')).toBe('tf-coil');
    expect(componentFromSlug('tf-coil')).toBe('tf-coil');
    expect(componentFromSlug('neutral-beam-injector')).toBe('neutral-beam');
    expect(componentFromSlug('nope')).toBeNull();
    expect(componentFromSlug(null)).toBeNull();
  });

  it('maps equipment rows to components for bidirectional selection', () => {
    expect(componentFromEquipmentId('tf-coil')).toBe('tf-coil');
    expect(componentFromEquipmentId('nbi')).toBe('neutral-beam');
    expect(componentFromEquipmentId('cryo')).toBe('cryostat');
    expect(componentFromEquipmentId('coolant-pump')).toBe('coolant-manifold');
    expect(componentFromEquipmentId('unknown-device')).toBeNull();
  });

  it('routes each component to the documented console page', () => {
    expect(COMPONENT_REGISTRY['tf-coil'].page).toBe('MAGNETIC');
    expect(COMPONENT_REGISTRY['neutral-beam'].page).toBe('HEATING');
    expect(COMPONENT_REGISTRY['coolant-manifold'].page).toBe('COOLING');
    expect(COMPONENT_REGISTRY.plasma.page).toBe('REACTOR');
  });

  it('maps active faults to the affected 3D components', () => {
    expect(faultedComponents(['COIL_OVERHEAT'])).toEqual(expect.arrayContaining(['tf-coil', 'cryostat']));
    expect(faultedComponents(['COOLANT_LOSS'])).toEqual(
      expect.arrayContaining(['coolant-manifold', 'divertor', 'plasma']),
    );
    expect(faultedComponents([])).toEqual([]);
    expect(faultedComponents(['SENSOR_BIAS'])).toEqual([]);
  });

  it('provides a propagation chain for every affected fault and none for sensors', () => {
    expect(FAULT_PROPAGATION.COIL_OVERHEAT.length).toBeGreaterThan(1);
    expect(FAULT_PROPAGATION.VACUUM_LEAK[0]).toBe('vacuum-vessel');
    expect(FAULT_PROPAGATION.SENSOR_DROPOUT).toEqual([]);
    // every component in a propagation chain must be a real registry entry
    for (const chain of Object.values(FAULT_PROPAGATION)) {
      for (const id of chain) expect(COMPONENT_REGISTRY[id]).toBeTruthy();
    }
    for (const list of Object.values(FAULT_AFFECTED_COMPONENTS)) {
      for (const id of list) expect(COMPONENT_REGISTRY[id]).toBeTruthy();
    }
  });
});
