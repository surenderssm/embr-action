const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

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
async function createBuild(apiBaseUrl, projectId, branch, commitSha) {
  try {
    const endpoint = `${apiBaseUrl}/projects/${projectId}/builds`;
    
    core.info(`Creating build at: ${endpoint}`);
    core.info(`Branch: ${branch}`);
    core.info(`Commit SHA: ${commitSha}`);
    
    const response = await axios.post(endpoint, {
      branch,
      commitSha
    }, {
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
 * Main action entry point
 */
async function run() {
  try {
    // Get inputs
    const projectId = core.getInput('project-id', { required: true });
    const apiBaseUrl = core.getInput('api-base-url') || 'https://embr-poc.azurewebsites.net/api';
    
    core.info('='.repeat(50));
    core.info('🔥 Welcome to Embr!');
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
    if (!branchName || branchName === 'unknown' || repoContext.refType === 'unknown') {
      core.warning('Could not determine branch name from context, using commit SHA as fallback');
      branchName = repoContext.commit;
    }
    
    core.info(`Using branch name: ${branchName}`);
    
    // Create build
    core.info('='.repeat(50));
    core.info('Creating build');
    core.info('='.repeat(50));
    const buildResponse = await createBuild(
      apiBaseUrl,
      projectId,
      branchName,
      repoContext.commit
    );
    
    // Set outputs
    core.setOutput('status', 'completed');
    core.setOutput('response', JSON.stringify(buildResponse));
    
    core.info('='.repeat(50));
    core.info('Action completed successfully!');
    core.info('='.repeat(50));
    
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

// Run the action
run();
