# Embr Action

A GitHub Action that creates Embr builds with automatically captured branch and commit information. Simply provide your project ID, and the action handles the rest.

## Features

- 🎯 **Simple Configuration**: Only requires project ID - branch and commit are auto-captured
- 📡 **Embr API Integration**: Directly integrates with Embr build API
- 🔄 **Automatic Polling**: Continuously polls for build completion status
- 📊 **Rich Context**: Automatically captures branch name and commit SHA from GitHub
- ⚙️ **Configurable**: Customizable polling interval, retry limits, and timeouts
- 🎯 **Smart Status Detection**: Automatically detects completion, failure, or timeout states

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
        uses: surenderssm/embr-action@v1
        with:
          project-id: 'c53f464b-6c5c-49ec-8212-fc1c26129bac'
```

### Advanced Example

```yaml
name: Embr Build Workflow

on:
  push:
    branches: [ main, develop ]

jobs:
  embr-build:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Embr Build with custom settings
        id: embr
        uses: surenderssm/embr-action@v1
        with:
          project-id: 'c53f464b-6c5c-49ec-8212-fc1c26129bac'
          polling-interval: '15'
          max-attempts: '20'
          timeout: '45000'
        
      - name: Check build result
        run: |
          echo "Build Status: ${{ steps.embr.outputs.status }}"
          echo "Build Response: ${{ steps.embr.outputs.response }}"
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `project-id` | The Embr project ID | Yes | - |
| `api-base-url` | The API base URL | No | `https://embr-poc.azurewebsites.net/api` |
| `polling-interval` | Polling interval in seconds | No | `10` |
| `max-attempts` | Maximum number of polling attempts | No | `30` |
| `timeout` | Timeout for each HTTP request in milliseconds | No | `30000` |

## Outputs

| Output | Description |
|--------|-------------|
| `status` | Status of the build execution (`completed`, `failed`, or `timeout`) |
| `response` | JSON response from the Embr API |

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
        uses: surenderssm/embr-action@v1
        with:
          project-id: 'dev-project-id'
  
  build-prod:
    runs-on: ubuntu-latest
    needs: build-dev
    steps:
      - name: Trigger Production Build
        uses: surenderssm/embr-action@v1
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
