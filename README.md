# Embr Action

A GitHub Action that calls an endpoint with repository context (repository name, branch, commit details) and continuously polls for task completion.

## Features

- 📡 **Endpoint Integration**: Calls a specified endpoint with full repository context
- 🔄 **Automatic Polling**: Continuously polls the endpoint to check task status
- 📊 **Rich Context**: Provides repository name, branch, commit SHA, actor, and workflow information
- ⚙️ **Configurable**: Customizable polling interval, retry limits, and timeouts
- 🎯 **Smart Status Detection**: Automatically detects completion, failure, or timeout states

## Usage

### Basic Example

```yaml
name: Embr Task Workflow

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  embr-task:
    runs-on: ubuntu-latest
    steps:
      - name: Run Embr Action
        uses: surenderssm/embr-action@v1
        with:
          endpoint: 'https://api.example.com/task'
```

### Advanced Example

```yaml
name: Embr Task Workflow

on:
  push:
    branches: [ main, develop ]

jobs:
  embr-task:
    runs-on: ubuntu-latest
    steps:
      - name: Run Embr Action with custom settings
        id: embr
        uses: surenderssm/embr-action@v1
        with:
          endpoint: 'https://api.example.com/task'
          polling-interval: '15'
          max-attempts: '20'
          timeout: '45000'
        
      - name: Check task result
        run: |
          echo "Task Status: ${{ steps.embr.outputs.status }}"
          echo "Task Response: ${{ steps.embr.outputs.response }}"
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `endpoint` | The endpoint URL to call and poll | Yes | - |
| `polling-interval` | Polling interval in seconds | No | `10` |
| `max-attempts` | Maximum number of polling attempts | No | `30` |
| `timeout` | Timeout for each HTTP request in milliseconds | No | `30000` |

## Outputs

| Output | Description |
|--------|-------------|
| `status` | Status of the task execution (`completed`, `failed`, or `timeout`) |
| `response` | JSON response from the endpoint |

## Repository Context

The action automatically captures and sends the following context to your endpoint:

```json
{
  "repository": "embr-action",
  "owner": "surenderssm",
  "fullRepository": "surenderssm/embr-action",
  "ref": "main",
  "refType": "branch",
  "branch": "main",
  "tag": null,
  "commit": "abc123def456...",
  "actor": "username",
  "workflow": "Embr Task Workflow",
  "eventName": "push",
  "runId": "123456789",
  "runNumber": "42",
  "timestamp": "2026-01-29T07:00:00.000Z"
}
```

## Endpoint Requirements

Your endpoint should:

1. **Initial POST Request**: Accept a POST request with the repository context
2. **Polling GET Requests**: Respond to GET requests with query parameters:
   - `repository`: Full repository name (e.g., `owner/repo`)
   - `commit`: Commit SHA
   - `runId`: GitHub Actions run ID

3. **Status Response**: Return a JSON response with a status field:
   ```json
   {
     "status": "completed|success|failed|error|in_progress",
     "complete": true|false,
     "message": "Optional status message",
     "data": {}
   }
   ```

### Status Values

- `completed` or `success`: Task finished successfully
- `failed` or `error`: Task encountered an error
- `in_progress` or other values: Task is still running (continue polling)

## How It Works

1. **Initialization**: The action gathers repository context (name, branch, commit, etc.)
2. **Initial Call**: Makes a POST request to the endpoint with all context data
3. **Polling Loop**: 
   - Makes GET requests to check task status
   - Waits for the specified polling interval between attempts
   - Continues until task completes, fails, or max retries is reached
4. **Completion**: Sets output values and exits with appropriate status

## Example Endpoint Implementation

Here's a simple Node.js Express example:

```javascript
const express = require('express');
const app = express();

app.use(express.json());

// Store task status
const tasks = {};

// Receive initial task
app.post('/task', (req, res) => {
  const { fullRepository, commit, runId } = req.body;
  const taskId = `${fullRepository}-${commit}-${runId}`;
  
  // Initialize task
  tasks[taskId] = { status: 'in_progress', data: req.body };
  
  // Simulate async processing
  setTimeout(() => {
    tasks[taskId].status = 'completed';
  }, 30000); // Complete after 30 seconds
  
  res.json({ taskId, status: 'accepted' });
});

// Poll for status
app.get('/task', (req, res) => {
  const { repository, commit, runId } = req.query;
  const taskId = `${repository}-${commit}-${runId}`;
  
  const task = tasks[taskId] || { status: 'not_found' };
  res.json(task);
});

app.listen(3000);
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

### Testing Locally

To test the action locally, you can set environment variables and run the script:

```bash
export INPUT_ENDPOINT="https://api.example.com/task"
export INPUT_POLLING_INTERVAL="5"
export GITHUB_REPOSITORY="owner/repo"
export GITHUB_REF="refs/heads/main"
export GITHUB_SHA="abc123"

node src/index.js
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
