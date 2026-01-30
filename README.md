# Embr Action

A GitHub Action that creates Embr builds with automatically captured branch and commit information. Simply provide your project ID, and the action handles the rest.

## Features

- 🎯 **Simple Configuration**: Only requires project ID - branch and commit are auto-captured
- 📡 **Embr API Integration**: Directly integrates with Embr build API
- 🔄 **Automatic Polling**: Continuously polls for build completion status (10 min max)
- 📊 **Rich Context**: Automatically captures branch name and commit SHA from GitHub
- 🚀 **Deployment Info**: Returns deployment URL when available
- 🎯 **Smart Status Detection**: Automatically detects success, failure, or timeout states

## Usage

### Basic Example

```yaml
name: Embr Build Workflow

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  embr-build:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Embr Build
        uses: surenderssm/embr-action@main
        with:
          project-id: 'your-project-id'
```

### Using Outputs

```yaml
name: Embr Build Workflow

on:
  push:
    branches: [ main, develop ]

jobs:
  embr-build:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Embr Build
        id: embr
        uses: surenderssm/embr-action@main
        with:
          project-id: 'your-project-id'
        
      - name: Show build results
        run: |
          echo "Status: ${{ steps.embr.outputs.status }}"
          echo "Build ID: ${{ steps.embr.outputs.build-id }}"
          echo "Build Number: ${{ steps.embr.outputs.build-number }}"
          echo "Deployment URL: ${{ steps.embr.outputs.deployment-url }}"
```

### Upload Mode Example

```yaml
name: Embr Upload Workflow

on:
  push:
    branches: [ main ]

jobs:
  build-and-upload:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Build your app
        run: |
          # Your build steps here
          npm install && npm run build
          
      - name: Create zip artifact
        run: zip -r build.zip ./dist
        
      - name: Upload to Embr
        id: embr
        uses: surenderssm/embr-action@main
        with:
          mode: 'upload'
          project-id: 'your-project-id'
          environment-id: 'your-environment-id'
          zip-file: 'build.zip'
        
      - name: Show results
        run: |
          echo "Status: ${{ steps.embr.outputs.status }}"
          echo "Deployment URL: ${{ steps.embr.outputs.deployment-url }}"
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `mode` | Action mode: `build` or `upload` | No | `build` |
| `project-id` | The Embr project ID | Yes | - |
| `environment-id` | The Embr environment ID (required for upload mode) | No | - |
| `zip-file` | Path to the zip file to upload (required for upload mode) | No | - |
| `api-base-url` | Base URL for the Embr API | No | `https://embr-poc.azurewebsites.net/api` |

## Outputs

| Output | Description |
|--------|-------------|
| `status` | Status of the build (`succeeded`, `failed`, or `timeout`) |
| `build-id` | The unique build ID |
| `build-number` | The build number |
| `log-path` | Path to the build logs |
| `deployment-url` | URL where the app is deployed |
| `response` | Full JSON response from the Embr API |

## How It Works

1. **Capture Context**: The action automatically captures the current branch name and commit SHA from GitHub
2. **Create Build**: Makes a POST request to `https://embr-poc.azurewebsites.net/api/projects/{project-id}/builds` with:
   ```json
   {
     "branch": "main",
     "commitSha": "abc123def456..."
   }
   ```
3. **Poll Status**: If a build ID is returned, polls the build status endpoint until completion
4. **Report Results**: Sets outputs with final status and response data

## API Endpoint

The action calls the following Embr API endpoint:

**POST** `https://embr-poc.azurewebsites.net/api/projects/{project-id}/builds`

**Request Headers:**
- `accept: text/plain`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "branch": "branch-name",
  "commitSha": "commit-sha-value"
}
```

## Branch Detection

The action intelligently detects the branch name:
- For branch pushes: uses the branch name (e.g., `main`, `develop`)
- For tags: uses the tag name
- For pull requests: uses the PR reference
- Fallback: uses the commit SHA if branch cannot be determined

## Example with Multiple Jobs

```yaml
name: Embr Multi-Environment Build

on:
  push:
    branches: [ main ]

jobs:
  build-dev:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Dev Build
        uses: surenderssm/embr-action@main
        with:
          project-id: 'dev-project-id'
  
  build-prod:
    runs-on: ubuntu-latest
    needs: build-dev
    steps:
      - name: Trigger Production Build
        uses: surenderssm/embr-action@main
        with:
          project-id: 'prod-project-id'
```

## Development

### Building the Action

```bash
# Install dependencies
npm install

# Build the action
npm run build
```

The build process uses `@vercel/ncc` to compile the action and its dependencies into a single file in the `dist` directory.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
