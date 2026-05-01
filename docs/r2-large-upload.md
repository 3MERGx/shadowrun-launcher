# Uploading large files to Cloudflare R2 (e.g. `build.zip`)

The R2 dashboard upload has a **size limit** (~300 MB). For bigger assets like the game `build.zip`, use the **S3-compatible API** instead (multipart uploads happen automatically).

## Prerequisites

1. **AWS CLI v2** installed on Windows (e.g. `winget install Amazon.AWSCLI`).
2. If `aws` is not found in PowerShell, either **open a new terminal** after install or call the CLI by full path, for example:

   `%ProgramFiles%\Amazon\AWSCLIV2\aws.exe`

3. **R2 API credentials** — In Cloudflare: **R2 → Manage R2 API Tokens → Create API Token** with permission to **write objects** to your target bucket (not the general “Global API Key”).

4. Your **account S3 endpoint** — **R2 → Overview** shows the endpoint in the form:

   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

   Use the same Cloudflare account that owns the bucket.

## Bucket vs object key (`s3://`)

Object storage URLs look like:

`s3://<bucket-name>/<object-key>`

Example:

- Bucket: `shadowrun-launcher`
- Path inside bucket: `releases/build.zip`

Full URI:

`s3://shadowrun-launcher/releases/build.zip`

Uploading to that URI **replaces** whatever was already stored at `releases/build.zip`.

## Upload (PowerShell)

Set credentials **only for this session** (never commit keys):

```powershell
$env:AWS_ACCESS_KEY_ID = "<access-key-id-from-r2-token>"
$env:AWS_SECRET_ACCESS_KEY = "<secret-access-key-from-r2-token>"
```

Run upload (adjust local path, bucket name, object key, account ID):

```powershell
aws s3 cp "C:\path\to\build.zip" `
  "s3://<bucket-name>/releases/build.zip" `
  --endpoint-url "https://<ACCOUNT_ID>.r2.cloudflarestorage.com" `
  --region auto
```

Confirm object exists:

```powershell
aws s3 ls "s3://<bucket-name>/releases/" `
  --endpoint-url "https://<ACCOUNT_ID>.r2.cloudflarestorage.com" `
  --region auto
```

Afterwards, close the terminal or clear the variables.

## Troubleshooting

| Issue | What to check |
|--------|----------------|
| `Unauthorized` / `CreateMultipartUpload` fails | Token must allow **write** on that bucket; credentials must be **R2 API token** (S3-style Access Key ID + Secret). |
| Still `Unauthorized` | **`--endpoint-url`** must use the **same account** as the bucket (`ACCOUNT_ID` matches your dashboard). |
| `aws` not recognized | Use full path to `aws.exe`, or add `AWSCLIV2` to PATH and restart the terminal. |

Public download URLs usually come from a **custom domain** tied to the bucket — verify in the dashboard that the path (e.g. `/releases/build.zip`) matches where you uploaded the object.
