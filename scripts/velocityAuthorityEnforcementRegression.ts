import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {approvalAuthorityVersion,evaluateAuthority,type AuthoritySnapshot} from "../lib/server/identity/identityAuthorityEnforcement";

const root=process.cwd(),auth="authority-current",membershipVersion=7;
const current:AuthoritySnapshot={membershipVersion,authorizationVersion:auth,role:"underwriter",membershipStatus:"active",approvalAuthorityVersions:{approve:approvalAuthorityVersion("underwriter","approve"),deny:approvalAuthorityVersion("underwriter","deny")}};
const expected={expectedMembershipVersion:membershipVersion,expectedAuthorizationVersion:auth,expectedApprovalAuthorityVersion:current.approvalAuthorityVersions.approve};
assert.equal(evaluateAuthority({current,expected,action:"approve"}).ok,true,"current authority allows approval boundary");
assert.equal(evaluateAuthority({current,expected:{...expected,expectedMembershipVersion:6},action:"approve"}).code,"MEMBERSHIP_STALE");
assert.equal(evaluateAuthority({current,expected:{...expected,expectedAuthorizationVersion:"authority-old"},action:"approve"}).code,"AUTHORIZATION_STALE");
const changedRole={...current,role:"viewer",authorizationVersion:"authority-role-changed",approvalAuthorityVersions:{approve:approvalAuthorityVersion("viewer","approve"),deny:approvalAuthorityVersion("viewer","deny")}};
assert.equal(evaluateAuthority({current:changedRole,expected,action:"approve"}).ok,false,"role change invalidates loaded request");
assert.equal(evaluateAuthority({current:{...current,approvalAuthorityVersions:{...current.approvalAuthorityVersions,approve:"approval-policy-new"}},expected,action:"approve"}).code,"APPROVAL_AUTHORITY_STALE");
assert.equal(evaluateAuthority({current:{...current,membershipStatus:"suspended"},expected,action:"approve"}).code,"MEMBERSHIP_INACTIVE");
assert.equal(evaluateAuthority({current,invalidation:{membershipVersion:8,authorizationVersion:"authority-new"},expected,action:"approve"}).code,"SESSION_AUTHORITY_STALE");

const workflow=readFileSync(join(root,"lib/server/workflow/applicationWorkflowCommands.ts"),"utf8"),decision=readFileSync(join(root,"lib/server/decisions/applicationDecisionCommand.ts"),"utf8"),projection=readFileSync(join(root,"lib/server/applications/applicationReadProjection.ts"),"utf8"),workspace=readFileSync(join(root,"app/applications/[id]/review/page.tsx"),"utf8");
for(const command of ["assign_underwriter","change_workflow_stage","create_condition","set_condition_status","remove_condition","replace_generated_conditions","update_borrower_verification","reset_after_documents_deleted","set_priority","transition_workflow"])assert.match(workflow,new RegExp(`HIGH_RISK_WORKFLOW_COMMANDS[\\s\\S]*${command}`));
assert.match(workflow,/AUTHORITY_VERSION_REQUIRED/);assert.match(decision,/expectedApprovalAuthorityVersion/);assert.match(decision,/enforceAuthorityInTransaction/);
assert.match(projection,/membershipVersion:authority\.membershipVersion,authorizationVersion:authority\.authorizationVersion/);
assert.match(workspace,/workspace\.authority\.membershipVersion/);assert.match(workspace,/was not retried/);assert.match(workspace,/await load\(\)\.catch/);
console.log("Identity authority enforcement regression passed: 18 assertions.");
