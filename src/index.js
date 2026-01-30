const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const UI_BASE_URL = 'https://embr-poc-ui.azurewebsites.net';

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
 * Upload a zip file to Embr
 */
async function uploadBuild(apiBaseUrl, projectId, environmentId, zipFilePath) {
  try {
    const endpoint = `${apiBaseUrl}/projects/${projectId}/environments/${environmentId}/builds/upload`;
    
    core.info(`Uploading build to: ${endpoint}`);
    core.info(`Zip file: ${zipFilePath}`);
    
    // Read the zip file
    const absolutePath = path.resolve(zipFilePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Zip file not found: ${absolutePath}`);
    }
    
    const fileBuffer = fs.readFileSync(absolutePath);
    const fileSize = fs.statSync(absolutePath).size;
    core.info(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    
    const response = await axios.post(endpoint, fileBuffer, {
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/zip',
        'User-Agent': 'embr-action'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    core.info(`Response status: ${response.status}`);
    
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
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'embr-action'
      }
    });
    
    core.info(`Response status: ${response.status}`);
    
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
 * Poll the build status endpoint until completion
 */
async function pollBuildStatus(apiBaseUrl, projectId, buildId) {
  const endpoint = `${apiBaseUrl}/projects/${projectId}/builds/${buildId}`;
  const pollingInterval = 10; // seconds
  const maxAttempts = 60; // 10 minutes max
  
  core.info(`Polling build status at: ${endpoint}`);
  core.info(`Navigate to see live build logs: ${UI_BASE_URL}/builds/${projectId}/${buildId}`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      core.info(`Polling attempt ${attempt}/${maxAttempts}...`);
      
      const response = await axios.get(endpoint, {
        headers: {
          'accept': 'application/json',
          'User-Agent': 'embr-action'
        }
      });
      
      const build = response.data.build;
      const status = build.status;
      
      core.info(`Build status: ${status}`);
      
      // Check if build is complete
      if (status === 'Succeeded' || status === 'completed' || status === 'success') {
        return {
          success: true,
          data: response.data
        };
      }
      
      // Check if build has failed
      if (status === 'Failed' || status === 'failed' || status === 'error') {
        return {
          success: false,
          data: response.data
        };
      }
      
      // Still in progress, wait and retry
      await sleep(pollingInterval * 1000);
      
    } catch (error) {
      core.warning(`Polling attempt ${attempt} failed: ${error.message}`);
      if (attempt < maxAttempts) {
        await sleep(pollingInterval * 1000);
      }
    }
  }
  
  // Timeout
  core.warning('Build polling timed out');
  return {
    success: false,
    data: null,
    timeout: true
  };
}

/**
 * Main action entry point
 */
async function run() {
  try {
    // Get inputs
    const mode = core.getInput('mode') || 'build';
    const projectId = core.getInput('project-id', { required: true });
    const apiBaseUrl = core.getInput('api-base-url') || 'https://embr-poc.azurewebsites.net/api';
    
    const buildLogsUrl = (buildId) => `${UI_BASE_URL}/builds/${projectId}/${buildId}`;
    
    core.info('='.repeat(50));
    core.info('🔥 Welcome to Embr!');
    core.info('='.repeat(50));
    core.info('Embr Action Started');
    core.info('='.repeat(50));
    core.info(`Mode: ${mode}`);
    core.info(`API Base URL: ${apiBaseUrl}`);
    core.info(`Project ID: ${projectId}`);
    
    if (mode === 'upload') {
      // Upload mode - upload a zip file
      await runUploadMode(apiBaseUrl, projectId, buildLogsUrl);
    } else {
      // Build mode - create build from branch/commit (default)
      await runBuildMode(apiBaseUrl, projectId, buildLogsUrl);
    }
    
    core.info('='.repeat(50));
    
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

/**
 * Run upload mode - upload a zip file
 */
async function runUploadMode(apiBaseUrl, projectId, buildLogsUrl) {
  const environmentId = core.getInput('environment-id', { required: true });
  const zipFile = core.getInput('zip-file', { required: true });
  
  core.info(`Environment ID: ${environmentId}`);
  core.info(`Zip File: ${zipFile}`);
  
  // Upload build
  core.info('='.repeat(50));
  core.info('Uploading build');
  core.info('='.repeat(50));
  
  const uploadResponse = await uploadBuild(apiBaseUrl, projectId, environmentId, zipFile);
  
  // Extract build ID
  const buildId = uploadResponse.build?.id;
  if (!buildId) {
    throw new Error('No build ID returned from API');
  }
  
  core.info(`Build created with ID: ${buildId}`);
  core.info(`Build Number: ${uploadResponse.build?.buildNumber}`);
  core.info(`Status: ${uploadResponse.build?.status}`);
  
  // Poll for build completion
  core.info('='.repeat(50));
  core.info('Waiting for build to complete...');
  core.info('='.repeat(50));
  
  const result = await pollBuildStatus(apiBaseUrl, projectId, buildId);
  
  // Set outputs
  core.info('='.repeat(50));
  
  handleBuildResult(result, buildId, buildLogsUrl);
}

/**
 * Run build mode - create build from branch/commit
 */
async function runBuildMode(apiBaseUrl, projectId, buildLogsUrl) {
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
  
  // Extract build ID
  const buildId = buildResponse.build?.id;
  if (!buildId) {
    throw new Error('No build ID returned from API');
  }
  
  core.info(`Build created with ID: ${buildId}`);
  core.info(`Build Number: ${buildResponse.build?.buildNumber}`);
  core.info(`Status: ${buildResponse.build?.status}`);
  
  // Poll for build completion
  core.info('='.repeat(50));
  core.info('Waiting for build to complete...');
  core.info('='.repeat(50));
  
  const result = await pollBuildStatus(apiBaseUrl, projectId, buildId);
  
  // Set outputs
  core.info('='.repeat(50));
  
  handleBuildResult(result, buildId, buildLogsUrl);
}

/**
 * Handle build result and set outputs
 */
function handleBuildResult(result, buildId, buildLogsUrl) {
  if (result.success && result.data) {
    const build = result.data.build;
    const deployment = result.data.deployment;
    
    core.info('✅ Build completed successfully!');
    core.info('='.repeat(50));
    core.info(`Build Number: ${build.buildNumber}`);
    core.info(`Duration: ${build.durationSeconds?.toFixed(1)}s`);
    core.info(`Build Logs: ${buildLogsUrl(buildId)}`);
    
    if (deployment?.url) {
      core.info('='.repeat(50));
      core.info('🚀 Deployment');
      core.info(`Deployed Site: ${deployment.url}`);
      core.info(`Status: ${deployment.status}`);
      core.setOutput('deployment-url', deployment.url);
    }
    
    core.setOutput('status', 'succeeded');
    core.setOutput('build-id', buildId);
    core.setOutput('build-number', build.buildNumber);
    core.setOutput('log-path', buildLogsUrl(buildId));
    core.setOutput('response', JSON.stringify(result.data));
    
  } else if (result.timeout) {
    core.setOutput('status', 'timeout');
    core.setFailed('Build timed out');
  } else {
    const build = result.data?.build;
    core.error('❌ Build failed');
    if (build?.statusMessage) {
      core.error(`Message: ${build.statusMessage}`);
    }
    core.setOutput('status', 'failed');
    core.setOutput('build-id', buildId);
    core.setOutput('response', JSON.stringify(result.data));
    core.setFailed('Build failed');
  }
}

// Run the action
run();
