/**
 * Single source of truth for release identity.
 *
 * Keep these in sync with package.json — `npm run version:check` enforces it.
 * The three versions are intentionally independent:
 *
 *  - APP_VERSION       changes with any user-visible release
 *  - MODEL_VERSION     changes only when the simulation model itself changes
 *                      (defaults, equations, constants). Model 1.0.0 is the
 *                      baseline shipped in v1.0.0 and is unchanged in v1.2.0.
 *  - EXPORT_SCHEMA_VERSION changes only for *incompatible* export changes.
 *                      v1.2.0 only adds optional metadata, so the schema stays 1:
 *                      files written by v1.0.0 remain readable, and files written
 *                      by v1.2.0 remain readable by a v1.0.0 reader that ignores
 *                      unknown fields.
 */

export const APP_NAME = 'FusionPlant Digital Twin';

/** Semantic version of the application. Must equal package.json "version". */
export const APP_VERSION = '1.2.1';

/** Version of the simulation model definition (equations, defaults, constants). */
export const MODEL_VERSION = '1.0.0';

/** Export JSON schema. 1 = v1.0.0 layout; v1.2.0 adds optional fields only. */
export const EXPORT_SCHEMA_VERSION = 1;

/** Human-readable release name shown in the console. */
export const RELEASE_NAME = 'Complete Verification';

/** Release date (ISO). */
export const RELEASE_DATE = '2026-10-23';

/** Compact label used in the top bar and page headers. */
export const VERSION_LABEL = `${APP_NAME} v${APP_VERSION}`;

/** Short label (brand area). */
export const VERSION_SHORT = `v${APP_VERSION}`;
