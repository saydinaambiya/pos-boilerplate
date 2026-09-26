# API problem types

Errors use [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457)
with `Content-Type: application/problem+json`. `type` values are relative to
the deployment origin.

| `type`                             | Status | Meaning                                                           |
| ---------------------------------- | ------ | ----------------------------------------------------------------- |
| `/problems/bad-request`            | 400    | Malformed request, e.g. body is not valid JSON                    |
| `/problems/not-found`              | 404    | Resource does not exist or is not visible to the caller           |
| `/problems/method-not-allowed`     | 405    | Method not supported; see the `Allow` header                      |
| `/problems/payload-too-large`      | 413    | Body exceeds the route's limit                                    |
| `/problems/unsupported-media-type` | 415    | Body must be `application/json`                                   |
| `/problems/validation-error`       | 422    | Body failed validation; `errors[]` lists a JSON Pointer per field |
| `/problems/internal-error`         | 500    | Unexpected failure; `detail` carries the request id for support   |

Every response includes `X-Request-Id`. Clients may send their own
(8–64 characters of `A–Z a–z 0–9 -`) to correlate logs.
