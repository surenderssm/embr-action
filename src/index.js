const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get repository context information
 */
function getRepositoryContext() {
  const context = github.context;
  
  return {
    repository: context.repo.repo,
    owner: context.repo.owner,
    fullRepository: `${context.repo.owner}/${context.repo.repo}`,
    branch: context.ref.replace('refs/heads/', ''),
    commit: context.sha,
    actor: context.actor,
    workflow: context.workflow,
    eventName: context.eventName,
    runId: context.runId,
    runNumber: context.runNumber
  };
}

/**
 * Call the endpoint with repository context
 */
async function callEndpoint(endpoint, repoContext, timeout) {
  try {
    core.info(`Calling endpoint: ${endpoint}`);
    core.info(`Repository context: ${JSON.stringify(repoContext, null, 2)}`);
    
    const response = await axios.post(endpoint, {
      ...repoContext,
      timestamp: new Date().toISOString()
    }, {
      timeout: timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'embr-action'
      }
    });
    
    core.info(`Response status: ${response.status}`);
    core.info(`Response data: ${JSON.stringify(response.data)}`);
    
    return response.data;
  } catch (error) {
    if (error.response) {
      core.error(`HTTP error: ${error.response.status} - ${error.response.statusText}`);
      core.error(`Response data: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      core.error(`No response received from endpoint: ${error.message}`);
    } else {
      core.error(`Error setting up request: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Poll the endpoint for status updates
 */
async function pollEndpoint(endpoint, repoContext, pollingInterval, maxRetries, timeout) {
  let retries = 0;
  let lastResponse = null;
  
  core.info(`Starting polling with interval: ${pollingInterval}s, max retries: ${maxRetries}`);
  
  while (retries < maxRetries) {
    try {
      core.info(`Polling attempt ${retries + 1}/${maxRetries}`);
      
      const response = await axios.get(endpoint, {
        timeout: timeout,
        params: {
          repository: repoContext.fullRepository,
          commit: repoContext.commit,
          runId: repoContext.runId
        },
        headers: {
          'User-Agent': 'embr-action'
        }
      });
      
      lastResponse = response.data;
      core.info(`Poll response: ${JSON.stringify(response.data)}`);
      
      // Check if task is complete
      // Assuming the endpoint returns a status field
      if (response.data.status === 'completed' || 
          response.data.status === 'success' || 
          response.data.complete === true) {
        core.info('Task completed successfully!');
        return {
          status: 'completed',
          response: response.data
        };
      }
      
      // Check if task has failed
      if (response.data.status === 'failed' || 
          response.data.status === 'error') {
        core.warning('Task reported failure status');
        return {
          status: 'failed',
          response: response.data
        };
      }
      
      // Continue polling
      core.info(`Task still in progress... waiting ${pollingInterval}s before next attempt`);
      await sleep(pollingInterval * 1000);
      retries++;
      
    } catch (error) {
      core.warning(`Polling attempt failed: ${error.message}`);
      retries++;
      
      if (retries < maxRetries) {
        core.info(`Waiting ${pollingInterval}s before retry...`);
        await sleep(pollingInterval * 1000);
      }
    }
  }
  
  // Max retries reached
  core.warning(`Max polling attempts (${maxRetries}) reached`);
  return {
    status: 'timeout',
    response: lastResponse
  };
}

/**
 * Main action entry point
 */
async function run() {
  try {
    // Get inputs
    const endpoint = core.getInput('endpoint', { required: true });
    const pollingInterval = parseInt(core.getInput('polling-interval') || '10', 10);
    const maxRetries = parseInt(core.getInput('max-retries') || '30', 10);
    const timeout = parseInt(core.getInput('timeout') || '30000', 10);
    
    core.info('='.repeat(50));
    core.info('Embr Action Started');
    core.info('='.repeat(50));
    
    // Get repository context
    const repoContext = getRepositoryContext();
    core.info(`Repository: ${repoContext.fullRepository}`);
    core.info(`Branch: ${repoContext.branch}`);
    core.info(`Commit: ${repoContext.commit}`);
    core.info(`Actor: ${repoContext.actor}`);
    core.info(`Event: ${repoContext.eventName}`);
    core.info(`Run ID: ${repoContext.runId}`);
    
    // Call the endpoint initially
    core.info('='.repeat(50));
    core.info('Step 1: Calling endpoint');
    core.info('='.repeat(50));
    const initialResponse = await callEndpoint(endpoint, repoContext, timeout);
    
    // Start polling
    core.info('='.repeat(50));
    core.info('Step 2: Starting polling');
    core.info('='.repeat(50));
    const pollResult = await pollEndpoint(
      endpoint,
      repoContext,
      pollingInterval,
      maxRetries,
      timeout
    );
    
    // Set outputs
    core.setOutput('status', pollResult.status);
    core.setOutput('response', JSON.stringify(pollResult.response));
    
    // Log final status
    core.info('='.repeat(50));
    core.info(`Final Status: ${pollResult.status}`);
    core.info('='.repeat(50));
    
    if (pollResult.status === 'failed') {
      core.setFailed('Task execution failed');
    } else if (pollResult.status === 'timeout') {
      core.setFailed('Task execution timed out');
    } else {
      core.info('Action completed successfully!');
    }
    
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

// Run the action
run();
