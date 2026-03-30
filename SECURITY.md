# Security Policy

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability in OpenLib, please
**do not open a public GitHub issue**. Public disclosure of security issues
puts all users at risk.

### How to Report

Please report vulnerabilities by opening a **private security advisory** on GitHub:

👉 [Report a vulnerability](https://github.com/ameerhamzasaifi/openlib/security/advisories/new)

Alternatively, you can reach us by opening a **private** issue or contacting
the maintainer directly via GitHub.

### What to Include

To help us triage and fix the issue quickly, please provide:

- A clear description of the vulnerability
- The affected component (e.g., Firestore rules, authentication, client-side JS)
- Steps to reproduce or a proof-of-concept
- The potential impact if exploited
- Any suggested fix (optional but appreciated)

### What to Expect

| Milestone              | Timeframe         |
| ---------------------- | ----------------- |
| Initial acknowledgment | Within 48 hours   |
| Triage & assessment    | Within 5 days     |
| Fix or workaround      | Within 14 days    |
| Public disclosure      | After fix is live |

We will keep you informed throughout the process. If a reported vulnerability
is accepted, we will credit you in the release notes (unless you prefer to
remain anonymous). If it is declined, we will explain why.

## Scope

The following are **in scope** for security reports:

- Firestore security rules (unauthorized data access or modification)
- Authentication and authorization bypass
- Cross-site scripting (XSS) via user-supplied data
- Firebase Storage rule bypass
- Privilege escalation (e.g., gaining admin or maintainer role)
- Data exposure (e.g., private user data readable by unauthenticated users)

The following are **out of scope**:

- Vulnerabilities in third-party services (Firebase, Google, GitHub OAuth)
- Bugs that require physical access to a logged-in device
- Self-XSS that cannot affect other users
- Rate limiting on public read-only endpoints
- Social engineering attacks targeting team members

## Security Best Practices for Contributors

If you are contributing code to OpenLib, please follow these guidelines:

- Never commit `firebase-config.js` or any file containing real API keys
- Always run the Firestore emulator locally for testing (`firebase emulators:start`)
- Validate and sanitize all user input before writing to Firestore
- Use `esc()` for all user-controlled values rendered into HTML
- Follow the principle of least privilege when writing Firestore security rules

## License

This project is licensed under the [Mozilla Public License 2.0](LICENSE).
Security researchers are permitted to test against their own Firebase project
instance using the open-source code, but must not test against the live
production environment at `https://openlib-f7bf1.web.app` without prior
written permission.
