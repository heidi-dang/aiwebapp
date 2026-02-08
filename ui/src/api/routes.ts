export const APIRoutes = {
  GetAgents: (agentOSUrl: string) => `${agentOSUrl}/agents`,
  AgentRun: (agentOSUrl: string) => `${agentOSUrl}/agents/{agent_id}/runs`,
  Status: (agentOSUrl: string) => `${agentOSUrl}/health`,
  GetSessions: (agentOSUrl: string) => `${agentOSUrl}/sessions`,
  GetSession: (agentOSUrl: string, sessionId: string) =>
    `${agentOSUrl}/sessions/${sessionId}/runs`,

  DeleteSession: (agentOSUrl: string, sessionId: string) =>
    `${agentOSUrl}/sessions/${sessionId}`,

  GetTeams: (agentOSUrl: string) => `${agentOSUrl}/teams`,
  TeamRun: (agentOSUrl: string, teamId: string) =>
    `${agentOSUrl}/teams/${teamId}/runs`,
  DeleteTeamSession: (agentOSUrl: string, teamId: string, sessionId: string) =>
    `${agentOSUrl}/v1/teams/${teamId}/sessions/${sessionId}`,

  // New Phase 7-10 routes
  GuardrailsConfig: (agentOSUrl: string) => `${agentOSUrl}/guardrails/config`,
  GuardrailsTestInput: (agentOSUrl: string) => `${agentOSUrl}/guardrails/test-input`,
  GuardrailsTestOutput: (agentOSUrl: string) => `${agentOSUrl}/guardrails/test-output`,
  GuardrailsTestTool: (agentOSUrl: string) => `${agentOSUrl}/guardrails/test-tool`,

  Skills: (agentOSUrl: string) => `${agentOSUrl}/skills`,
  SkillDetail: (agentOSUrl: string, skillName: string) => `${agentOSUrl}/skills/${skillName}`,

  EvaluationSuites: (agentOSUrl: string) => `${agentOSUrl}/evaluation/suites`,
  EvaluationSuite: (agentOSUrl: string, suiteId: string) => `${agentOSUrl}/evaluation/suites/${suiteId}`,
  EvaluationRun: (agentOSUrl: string, suiteId: string) => `${agentOSUrl}/evaluation/suites/${suiteId}/run`,

  TracingCurrent: (agentOSUrl: string) => `${agentOSUrl}/tracing/current`,
  TracingExport: (agentOSUrl: string) => `${agentOSUrl}/tracing/export`,
  TracingStart: (agentOSUrl: string) => `${agentOSUrl}/tracing/start`,
  TracingEnd: (agentOSUrl: string) => `${agentOSUrl}/tracing/end`,

  ReasoningConfig: (agentOSUrl: string) => `${agentOSUrl}/reasoning/config`,
  ReasoningProcess: (agentOSUrl: string) => `${agentOSUrl}/reasoning/process`,
  ReasoningTest: (agentOSUrl: string) => `${agentOSUrl}/reasoning/test`,

  JobCancel: (agentOSUrl: string, jobId: string) => `${agentOSUrl}/jobs/${jobId}/cancel`,
  JobApprove: (agentOSUrl: string, jobId: string) => `${agentOSUrl}/jobs/${jobId}/approve`,
  JobReject: (agentOSUrl: string, jobId: string) => `${agentOSUrl}/jobs/${jobId}/reject`,
  JobStatus: (agentOSUrl: string, jobId: string) => `${agentOSUrl}/jobs/${jobId}/status`
}
