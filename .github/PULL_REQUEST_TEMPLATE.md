# Fix: Resolve npm audit vulnerabilities

## Description

This PR resolves npm audit vulnerabilities by updating vulnerable dependencies to patched versions.

## Changes

- Updated `@azure/msal-common` to v16.13.0 (security update)
- Updated `jsonwebtoken` to v9.1.2 (security update)
- Updated `ms` to v2.1.3 (security update)
- Updated `semver` to v7.6.3 (security update)

These updates address critical security vulnerabilities found during the Trivy filesystem scan.

## Type of change

- [x] Security fix (non-breaking change that fixes security vulnerabilities)

## Testing

The security scan workflow should now pass without detecting HIGH or CRITICAL severity vulnerabilities.
