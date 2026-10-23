import { MACHINE } from './constants';

/**
 * Shared tokamak geometry used by both the 3D scene and the 2D cross-section
 * diagrams, so every view of the machine agrees on proportions.
 */
export const TF_COIL_AMPLITUDE = MACHINE.minorRadiusM + 0.95;
export const TF_COIL_KAPPA = MACHINE.elongation;
export const TF_COIL_SHAPE_FACTOR = 0.34;

export interface PoloidalPoint {
  /** Radial coordinate, m. */
  r: number;
  /** Vertical coordinate, m. */
  z: number;
}

/** Closed D-shaped TF coil outline in the poloidal (R, z) plane. */
export function tfCoilOutline(segments = 84): PoloidalPoint[] {
  const points: PoloidalPoint[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const phi = (index / segments) * Math.PI * 2;
    const rho = TF_COIL_AMPLITUDE * Math.cos(phi + TF_COIL_SHAPE_FACTOR * Math.sin(phi));
    const z = TF_COIL_KAPPA * TF_COIL_AMPLITUDE * Math.sin(phi);
    points.push({ r: MACHINE.majorRadiusM + rho, z });
  }
  return points;
}

/** Approximate plasma separatrix used by the 2D diagrams. */
export function plasmaOutline(segments = 72): PoloidalPoint[] {
  const points: PoloidalPoint[] = [];
  const minor = MACHINE.minorRadiusM * 1.05;
  for (let index = 0; index <= segments; index += 1) {
    const theta = (index / segments) * Math.PI * 2;
    const rho = minor * Math.cos(theta + MACHINE.triangularity * Math.sin(theta));
    const z = MACHINE.elongation * minor * 0.82 * Math.sin(theta);
    points.push({ r: MACHINE.majorRadiusM + rho, z });
  }
  return points;
}

/** Poloidal field coil ring positions (radius, height, tube radius). */
export const PF_COIL_POSITIONS = [
  { radius: 4.1, y: 5.9, tube: 0.3 },
  { radius: 7.2, y: 6.35, tube: 0.28 },
  { radius: 10.4, y: 5.0, tube: 0.3 },
  { radius: 11.3, y: 0.9, tube: 0.32 },
  { radius: 10.7, y: -3.3, tube: 0.3 },
  { radius: 9.1, y: -5.9, tube: 0.28 },
  { radius: 5.0, y: -6.5, tube: 0.3 },
] as const;
