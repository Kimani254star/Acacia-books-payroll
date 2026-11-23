# Acacia Payroll redesign notes

## Changes
- Updated the app shell to a compact black Acacia Books-style sidebar and Cambria typography, with blue active states and primary actions.
- Kept Dashboard and Settings as primary navigation; Payroll sections are grouped in the expandable **Add More** list.
- Added visible links for Payroll Processing, Pay Runs & Approvals, Payslips, Reports, Employees, earnings, deductions, attendance, statutory items and integrations without changing their view IDs.
- Remembered the Add More open/closed state on this device.
- Added a mobile navigation drawer and backdrop so the sidebar modules remain reachable on small screens.
- Improved mobile page padding, table overflow, forms, modal sizing and action-button wrapping.
- Updated install manifest theme colors and expanded the service-worker app-shell precache to include local JS/CSS assets.

## Validation performed
- JavaScript syntax checked with Node for the local app scripts.
- Manifest JSON parsed.
- Verified local PWA icons, manifest, service worker and navigation module IDs exist.
- Static review only: no browser runtime or deployed-site interaction test was available in this environment.
- No live payroll/accounting records were changed.
