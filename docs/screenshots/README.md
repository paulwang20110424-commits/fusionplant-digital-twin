# Screenshots

All images in this directory were captured from the running application with the
headless audit script (`npm run audit`), not hand-edited.

| File | Console page / state |
| --- | --- |
| `overview.jpg` | OVERVIEW — plant running, 3D twin, live KPIs, trends, alarms |
| `reactor-3d.jpg` | REACTOR — 3D assembly after an orbit/zoom interaction |
| `magnetic-field.jpg` | MAGNETIC FIELD — poloidal cross-section plus field and coil trends |
| `power-grid.jpg` | POWER GRID — generation/recirculation/net energy-flow bars |
| `simulation-lab.jpg` | SIMULATION — WHAT-IF comparison after a headless run |
| `diagnostics.jpg` | DIAGNOSTICS — sensor table, alarm history, full chart suite |
| `fault-injection.jpg` | OVERVIEW — a fault injected from the quick fault panel |

## Regenerating

```bash
npm run dev            # in one terminal
npm run audit          # in another — writes PNG captures to .smoke/
```

The audit writes screenshots plus a JSON report to `.smoke/` (git-ignored). To
refresh the documentation images, export selected captures as compressed JPEG:

```bash
python3 - <<'PY'
from PIL import Image
Image.open('.smoke/a2-overview-running.png').convert('RGB').save(
    'docs/screenshots/overview.jpg', 'JPEG', quality=82, optimize=True, progressive=True)
PY
```

All captures show the `SIMULATION MODE` badge: every value is synthetic.
