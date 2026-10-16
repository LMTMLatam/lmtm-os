import { describe, expect, it } from "vitest";
import { assertAdminEmpresa, assertBoardOrgAccess, assertCompanyAccess, assertMiembro, esAdminEmpresa, hasBoardOrgAccess } from "../routes/authz.js";

function makeReq(input: {
  method?: string;
  actor: Express.Request["actor"];
}) {
  return {
    method: input.method ?? "GET",
    actor: input.actor,
  } as Express.Request;
}

describe("assertCompanyAccess", () => {
  it("allows viewer memberships to read", () => {
    const req = makeReq({
      method: "GET",
      actor: {
        type: "board",
        userId: "user-1",
        source: "session",
        companyIds: ["company-1"],
        memberships: [
          { companyId: "company-1", membershipRole: "viewer", status: "active" },
        ],
      },
    });

    expect(() => assertCompanyAccess(req, "company-1")).not.toThrow();
  });

  it("rejects viewer memberships for writes", () => {
    const req = makeReq({
      method: "PATCH",
      actor: {
        type: "board",
        userId: "user-1",
        source: "session",
        companyIds: ["company-1"],
        memberships: [
          { companyId: "company-1", membershipRole: "viewer", status: "active" },
        ],
      },
    });

    expect(() => assertCompanyAccess(req, "company-1")).toThrow("Viewer access is read-only");
  });

  it("rejects writes when membership details are present but omit the target company", () => {
    const req = makeReq({
      method: "POST",
      actor: {
        type: "board",
        userId: "user-1",
        source: "session",
        companyIds: ["company-1"],
        memberships: [],
      },
    });

    expect(() => assertCompanyAccess(req, "company-1")).toThrow("User does not have active company access");
  });

  it("allows legacy board actors that only provide company ids", () => {
    const req = makeReq({
      method: "POST",
      actor: {
        type: "board",
        userId: "user-1",
        source: "session",
        companyIds: ["company-1"],
      },
    });

    expect(() => assertCompanyAccess(req, "company-1")).not.toThrow();
  });

  it("rejects signed-in instance admins without explicit company access", () => {
    const req = makeReq({
      method: "GET",
      actor: {
        type: "board",
        userId: "admin-1",
        source: "session",
        isInstanceAdmin: true,
        companyIds: [],
        memberships: [],
      },
    });

    expect(() => assertCompanyAccess(req, "company-1")).toThrow("User does not have access to this company");
  });

  it("allows local trusted board access without explicit membership", () => {
    const req = makeReq({
      method: "GET",
      actor: {
        type: "board",
        userId: "local-board",
        source: "local_implicit",
        isInstanceAdmin: true,
      },
    });

    expect(() => assertCompanyAccess(req, "company-1")).not.toThrow();
  });
});

describe("assertBoardOrgAccess", () => {
  it("allows signed-in board users with active company access", () => {
    const req = makeReq({
      actor: {
        type: "board",
        userId: "user-1",
        source: "session",
        companyIds: ["company-1"],
        memberships: [{ companyId: "company-1", membershipRole: "operator", status: "active" }],
        isInstanceAdmin: false,
      },
    });

    expect(hasBoardOrgAccess(req)).toBe(true);
    expect(() => assertBoardOrgAccess(req)).not.toThrow();
  });

  it("allows instance admins without company memberships", () => {
    const req = makeReq({
      actor: {
        type: "board",
        userId: "admin-1",
        source: "session",
        companyIds: [],
        memberships: [],
        isInstanceAdmin: true,
      },
    });

    expect(hasBoardOrgAccess(req)).toBe(true);
    expect(() => assertBoardOrgAccess(req)).not.toThrow();
  });

  it("rejects signed-in users without company access or instance admin rights", () => {
    const req = makeReq({
      actor: {
        type: "board",
        userId: "outsider-1",
        source: "session",
        companyIds: [],
        memberships: [],
        isInstanceAdmin: false,
      },
    });

    expect(hasBoardOrgAccess(req)).toBe(false);
    expect(() => assertBoardOrgAccess(req)).toThrow("Company membership or instance admin access required");
  });
});

describe("assertMiembro y assertAdminEmpresa (16/10)", () => {
  const persona = (memberships: Array<{ companyId: string; membershipRole: string; status: string }>) =>
    makeReq({
      actor: { type: "board", userId: "u", source: "session", companyIds: memberships.filter((m) => m.status === "active").map((m) => m.companyId), memberships } as never,
    });

  it("una cuenta recién registrada, sin empresa, no entra a los datos del panel", () => {
    expect(() => assertMiembro(persona([]))).toThrow();
    expect(() => assertMiembro(persona([{ companyId: "c", membershipRole: "operator", status: "active" }]))).not.toThrow();
    expect(() => assertMiembro(makeReq({ actor: { type: "agent", agentId: "a", companyId: "c" } as never }))).not.toThrow();
    expect(() => assertMiembro(makeReq({ actor: { type: "none" } as never }))).toThrow();
  });

  it("finanzas y licitaciones: solo dueños y admins", () => {
    expect(() => assertAdminEmpresa(persona([{ companyId: "c", membershipRole: "operator", status: "active" }]))).toThrow();
    expect(() => assertAdminEmpresa(persona([{ companyId: "c", membershipRole: "viewer", status: "active" }]))).toThrow();
    expect(() => assertAdminEmpresa(persona([{ companyId: "c", membershipRole: "admin", status: "active" }]))).not.toThrow();
    expect(() => assertAdminEmpresa(persona([{ companyId: "c", membershipRole: "owner", status: "suspended" }]))).toThrow();
    expect(esAdminEmpresa(makeReq({ actor: { type: "board", userId: "u", source: "session", companyIds: [], memberships: [], isInstanceAdmin: true } as never }))).toBe(true);
  });
});
