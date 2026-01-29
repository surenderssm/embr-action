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
  
  // Extract branch/tag information based on ref type
  let refName = context.ref;
  let refType = 'unknown';
  
  if (context.ref.startsWith('refs/heads/')) {
    refName = context.ref.replace('refs/heads/', '');
    refType = 'branch';
  } else if (context.ref.startsWith('refs/tags/')) {
    refName = context.ref.replace('refs/tags/', '');
    refType = 'tag';
  } else if (context.ref.startsWith('refs/pull/')) {
    refName = context.ref;
    refType = 'pull_request';
  }
  
  return {
    repository: context.repo.repo,
    owner: context.repo.owner,
    fullRepository: `${context.repo.owner}/${context.repo.repo}`,
    ref: refName,
    refType: refType,
    branch: refType === 'branch' ? refName : null,
    tag: refType === 'tag' ? refName : null,
    commit: context.sha,
    actor: context.actor,
    workflow: context.workflow,
    eventName: context.eventName,
    runId: context.runId,
    runNumber: context.runNumber
  };
}

/**
 * Call the Embr API to create a build
 */
async function createBuild(apiBaseUrl, projectId, branch, commitSha, timeout) {
  try {
    const endpoint = `${apiBaseUrl}/projects/${projectId}/builds`;
    
    core.info(`Creating build at: ${endpoint}`);
    core.info(`Branch: ${branch}`);
    core.info(`Commit SHA: ${commitSha}`);
    
    const response = await axios.post(endpoint, {
      branch: branch,
      commitSha: commitSha
    }, {
      timeout: timeout,
      headers: {
        'accept': 'text/plain',
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
 * Poll the build status endpoint
 */
async function pollBuildStatus(apiBaseUrl, projectId, buildId, pollingInterval, maxAttempts, timeout) {
  let attempts = 0;
  let lastResponse = { status: 'unknown', message: 'No response received' };
  
  const endpoint = `${apiBaseUrl}/projects/${projectId}/builds/${buildId}`;
  
  core.info(`Starting polling with interval: ${pollingInterval}s, max attempts: ${maxAttempts}`);
  
  while (attempts < maxAttempts) {
    try {
      core.info(`Polling attempt ${attempts + 1}/${maxAttempts}`);
      
      const response = await axios.get(endpoint, {
        timeout: timeout,
        headers: {
          'accept': 'text/plain',
          'User-Agent': 'embr-action'
        }
      });
      
      lastResponse = response.data;
      core.info(`Poll response: ${JSON.stringify(response.data)}`);
      
      // Check if build is complete
      if (response.data.status === 'completed' || 
          response.data.status === 'success' || 
          response.data.status === 'succeeded' ||
          response.data.complete === true) {
        core.info('Build completed successfully!');
        return {
          status: 'completed',
          response: response.data
        };
      }
      
      // Check if build has failed
      if (response.data.status === 'failed' || 
          response.data.status === 'error') {
        core.warning('Build reported failure status');
        return {
          status: 'failed',
          response: response.data
        };
      }
      
      // Continue polling
      core.info(`Build still in progress... waiting ${pollingInterval}s before next attempt`);
      attempts++;
      
      if (attempts < maxAttempts) {
        await sleep(pollingInterval * 1000);
      }
      
    } catch (error) {
      core.warning(`Polling attempt failed: ${error.message}`);
      
      // Only continue if we have attempts left
      if (attempts + 1 < maxAttempts) {
        core.info(`Waiting ${pollingInterval}s before retry...`);
        await sleep(pollingInterval * 1000);
      }
      attempts++;
    }
  }
  
  // Max attempts reached
  core.warning(`Max polling attempts (${maxAttempts}) reached`);
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
    const projectId = core.getInput('project-id', { required: true });
    const apiBaseUrl = core.getInput('api-base-url') || 'https://embr-poc.azurewebsites.net/api';
    const pollingInterval = parseInt(core.getInput('polling-interval') || '10', 10);
    const maxAttempts = parseInt(core.getInput('max-attempts') || '30', 10);
    const timeout = parseInt(core.getInput('timeout') || '30000', 10);
    
    core.info('='.repeat(50));
    core.info('Embr Action Started');
    core.info('='.repeat(50));
    
    // Get repository context
    const repoContext = getRepositoryContext();
    core.info(`Repository: ${repoContext.fullRepository}`);
    core.info(`Ref: ${repoContext.ref} (${repoContext.refType})`);
    if (repoContext.branch) core.info(`Branch: ${repoContext.branch}`);
    if (repoContext.tag) core.info(`Tag: ${repoContext.tag}`);
    core.info(`Commit: ${repoContext.commit}`);
    core.info(`Actor: ${repoContext.actor}`);
    core.info(`Event: ${repoContext.eventName}`);
    core.info(`Run ID: ${repoContext.runId}`);
    core.info(`Project ID: ${projectId}`);
    
    // Determine branch name to use
    let branchName = repoContext.branch || repoContext.ref;
    if (!branchName || branchName === 'unknown') {
      core.warning('Could not determine branch name, using commit SHA as fallback');
      branchName = repoContext.commit;
    }
    
    // Create build
    core.info('='.repeat(50));
    core.info('Step 1: Creating build');
    core.info('='.repeat(50));
    const buildResponse = await createBuild(
      apiBaseUrl,
      projectId,
      branchName,
      repoContext.commit,
      timeout
    );
    
    // Check if build response includes an ID for polling
    let buildId = buildResponse.id || buildResponse.buildId || buildResponse.build_id;
    
    if (!buildId) {
      core.info('No build ID returned, setting outputs and completing');
      core.setOutput('status', 'completed');
      core.setOutput('response', JSON.stringify(buildResponse));
      core.info('Action completed successfully!');
      return;
    }
    
    core.info(`Build created with ID: ${buildId}`);
    
    // Check if build completed immediately
    if (buildResponse.status === 'completed' || 
        buildResponse.status === 'success' || 
        buildResponse.status === 'succeeded' ||
        buildResponse.complete === true) {
      core.info('Build completed immediately!');
      core.setOutput('status', 'completed');
      core.setOutput('response', JSON.stringify(buildResponse));
      core.info('Action completed successfully!');
      return;
    }
    
    // Check if build failed immediately
    if (buildResponse.status === 'failed' || 
        buildResponse.status === 'error') {
      core.warning('Build failed immediately');
      core.setOutput('status', 'failed');
      core.setOutput('response', JSON.stringify(buildResponse));
      core.setFailed('Build execution failed');
      return;
    }
    
    // Start polling for build status
    core.info('='.repeat(50));
    core.info('Step 2: Polling build status');
    core.info('='.repeat(50));
    const pollResult = await pollBuildStatus(
      apiBaseUrl,
      projectId,
      buildId,
      pollingInterval,
      maxAttempts,
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
      core.setFailed('Build execution failed');
    } else if (pollResult.status === 'timeout') {
      core.setFailed('Build execution timed out');
    } else {
      core.info('Action completed successfully!');
    }
    
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

// Run the action
run();
