// ── Firebase Database Module ─────────────────────────────────────────────────
// Extended Firestore operations: users, organizations, versions, recommendations, admin

import {
  collection, addDoc, query, where, getDocs, updateDoc,
  doc, setDoc, getDoc, orderBy, limit, increment, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { db } from './firebase-config.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  USER RECORDS — Collection: user_records/{uid}
// ═══════════════════════════════════════════════════════════════════════════════

export async function createOrUpdateUserRecord(user) {
  try {
    const ref = doc(db, "user_records", user.uid);
    const snap = await getDoc(ref);
    const now = new Date().toISOString();
    const provider = user.providerData?.[0]?.providerId || "unknown";

    if (snap.exists()) {
      await updateDoc(ref, {
        displayName: user.displayName || snap.data().displayName,
        email: user.email || snap.data().email,
        photoURL: user.photoURL || snap.data().photoURL,
        provider,
        lastLoginAt: now,
        updatedAt: now
      });
      return { id: snap.id, ...snap.data(), lastLoginAt: now };
    } else {
      const record = {
        uid: user.uid,
        displayName: user.displayName || "Anonymous",
        email: user.email || "",
        photoURL: user.photoURL || "",
        provider,
        role: "user",
        verified: false,
        teamAccount: false,
        bio: "",
        website: "",
        organizations: [],
        activity: {
          appsSubmitted: 0,
          editsProposed: 0,
          ratingsGiven: 0,
          reviewsDone: 0,
          appsAdded: 0
        },
        preferences: { categories: [], platforms: [] },
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now
      };
      await setDoc(ref, record);
      return { id: user.uid, ...record };
    }
  } catch (e) {
    console.error("Error creating/updating user record:", e);
    return null;
  }
}

export async function getUserRecord(uid) {
  try {
    const snap = await getDoc(doc(db, "user_records", uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.error("Error getting user record:", e);
    return null;
  }
}

export async function updateUserProfile(uid, data) {
  const allowed = ["displayName", "bio", "website", "preferences"];
  const update = {};
  allowed.forEach(k => { if (data[k] !== undefined) update[k] = data[k]; });
  update.updatedAt = new Date().toISOString();
  await updateDoc(doc(db, "user_records", uid), update);
}

export async function updateUserRole(uid, role, adminUid) {
  const admin = await getUserRecord(adminUid);
  if (!admin || !["admin", "openlib-team"].includes(admin.role)) {
    throw new Error("Unauthorized: Only admins can change roles");
  }
  const validRoles = ["user", "contributor", "maintainer", "admin", "openlib-team"];
  if (!validRoles.includes(role)) throw new Error("Invalid role");
  await updateDoc(doc(db, "user_records", uid), { role, updatedAt: new Date().toISOString() });
}

export async function setAccountVerified(uid, verified, adminUid) {
  const admin = await getUserRecord(adminUid);
  if (!admin || !["admin", "openlib-team"].includes(admin.role)) throw new Error("Unauthorized");
  await updateDoc(doc(db, "user_records", uid), { verified: !!verified, updatedAt: new Date().toISOString() });
}

export async function setTeamAccount(uid, isTeam, adminUid) {
  const admin = await getUserRecord(adminUid);
  if (!admin || !["admin", "openlib-team"].includes(admin.role)) throw new Error("Unauthorized");
  await updateDoc(doc(db, "user_records", uid), { teamAccount: !!isTeam, updatedAt: new Date().toISOString() });
}

export async function getAllUsers() {
  try {
    const snapshot = await getDocs(collection(db, "user_records"));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Error getting users:", e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ORGANIZATIONS — Collection: organizations/{orgId}
// ═══════════════════════════════════════════════════════════════════════════════

export async function createOrganization(data, creatorUid) {
  const creator = await getUserRecord(creatorUid);
  if (!creator) throw new Error("User not found");

  const now = new Date().toISOString();
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const existing = await getDocs(query(collection(db, "organizations"), where("slug", "==", slug)));
  if (!existing.empty) throw new Error("Organization name already taken");

  const orgData = {
    name: data.name,
    slug,
    description: data.description || "",
    logoURL: data.logoURL || "",
    website: data.website || "",
    ownerId: creatorUid,
    ownerType: "user",
    members: [{
      uid: creatorUid,
      role: "owner",
      displayName: creator.displayName,
      joinedAt: now
    }],
    verified: false,
    apps: [],
    createdAt: now,
    updatedAt: now
  };

  const ref = await addDoc(collection(db, "organizations"), orgData);

  const userOrgs = creator.organizations || [];
  await updateDoc(doc(db, "user_records", creatorUid), {
    organizations: [...userOrgs, ref.id],
    updatedAt: now
  });

  return { id: ref.id, ...orgData };
}

export async function getOrganization(orgId) {
  try {
    const snap = await getDoc(doc(db, "organizations", orgId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.error("Error getting org:", e);
    return null;
  }
}

export async function updateOrganization(orgId, data, uid) {
  const org = await getOrganization(orgId);
  if (!org) throw new Error("Organization not found");
  const member = org.members.find(m => m.uid === uid);
  if (!member || !["owner", "maintainer"].includes(member.role)) {
    throw new Error("Unauthorized");
  }
  const allowed = ["name", "description", "logoURL", "website"];
  const update = {};
  allowed.forEach(k => { if (data[k] !== undefined) update[k] = data[k]; });
  if (data.name) update.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  update.updatedAt = new Date().toISOString();
  await updateDoc(doc(db, "organizations", orgId), update);
}

export async function addOrgMember(orgId, memberEmail, role, adminUid) {
  const org = await getOrganization(orgId);
  if (!org) throw new Error("Organization not found");
  const admin = org.members.find(m => m.uid === adminUid);
  if (!admin || !["owner", "maintainer"].includes(admin.role)) throw new Error("Unauthorized");

  // Find user by email
  const usersSnap = await getDocs(query(collection(db, "user_records"), where("email", "==", memberEmail)));
  if (usersSnap.empty) throw new Error("User not found. They must sign in to OpenLib first.");
  const memberUser = { id: usersSnap.docs[0].id, ...usersSnap.docs[0].data() };

  if (org.members.some(m => m.uid === memberUser.uid)) throw new Error("Already a member");
  const validRoles = ["contributor", "maintainer"];
  if (!validRoles.includes(role)) throw new Error("Invalid role");

  const now = new Date().toISOString();
  await updateDoc(doc(db, "organizations", orgId), {
    members: [...org.members, { uid: memberUser.uid, role, displayName: memberUser.displayName, joinedAt: now }],
    updatedAt: now
  });

  const memberOrgs = memberUser.organizations || [];
  if (!memberOrgs.includes(orgId)) {
    await updateDoc(doc(db, "user_records", memberUser.uid), {
      organizations: [...memberOrgs, orgId],
      updatedAt: now
    });
  }
}

export async function removeOrgMember(orgId, memberUid, adminUid) {
  const org = await getOrganization(orgId);
  if (!org) throw new Error("Organization not found");
  if (memberUid === org.ownerId) throw new Error("Cannot remove the owner");
  const admin = org.members.find(m => m.uid === adminUid);
  if (!admin || admin.role !== "owner") throw new Error("Only the owner can remove members");

  const now = new Date().toISOString();
  await updateDoc(doc(db, "organizations", orgId), {
    members: org.members.filter(m => m.uid !== memberUid),
    updatedAt: now
  });

  const memberUser = await getUserRecord(memberUid);
  if (memberUser) {
    await updateDoc(doc(db, "user_records", memberUid), {
      organizations: (memberUser.organizations || []).filter(id => id !== orgId),
      updatedAt: now
    });
  }
}

export async function transferOwnership(orgId, newOwnerUid, currentOwnerUid) {
  const org = await getOrganization(orgId);
  if (!org) throw new Error("Organization not found");
  if (org.ownerId !== currentOwnerUid) throw new Error("Only the current owner can transfer ownership");

  const newOwner = await getUserRecord(newOwnerUid);
  if (!newOwner) throw new Error("New owner not found");

  const now = new Date().toISOString();
  let updatedMembers = org.members.map(m => {
    if (m.uid === currentOwnerUid) return { ...m, role: "maintainer" };
    if (m.uid === newOwnerUid) return { ...m, role: "owner" };
    return m;
  });

  if (!updatedMembers.some(m => m.uid === newOwnerUid)) {
    updatedMembers.push({ uid: newOwnerUid, role: "owner", displayName: newOwner.displayName, joinedAt: now });
  }

  await updateDoc(doc(db, "organizations", orgId), {
    ownerId: newOwnerUid,
    members: updatedMembers,
    updatedAt: now
  });
}

export async function transferToCorporation(orgId, corporationName, currentOwnerUid) {
  const org = await getOrganization(orgId);
  if (!org) throw new Error("Organization not found");
  if (org.ownerId !== currentOwnerUid) throw new Error("Unauthorized");
  await updateDoc(doc(db, "organizations", orgId), {
    ownerType: "corporation",
    corporationName,
    updatedAt: new Date().toISOString()
  });
}

export async function getUserOrganizations(uid) {
  try {
    const snapshot = await getDocs(collection(db, "organizations"));
    return snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(org => org.members?.some(m => m.uid === uid));
  } catch (e) {
    console.error("Error getting user orgs:", e);
    return [];
  }
}

export async function getAllOrganizations() {
  try {
    const snapshot = await getDocs(collection(db, "organizations"));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Error getting organizations:", e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  APP OWNERSHIP & VERSIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function submitAppWithOwner(payload, userId, ownerType = "user", ownerId = null) {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, "submissions"), {
    ...payload,
    userId,
    ownerType,
    ownerId: ownerId || userId,
    timestamp: now,
    status: "pending",
    version: "1.0.0"
  });
  await incrementActivity(userId, "appsSubmitted");
  return ref.id;
}

export async function getAppsByOwner(ownerId) {
  try {
    const q1 = query(collection(db, "apps"), where("ownerId", "==", ownerId));
    const snap1 = await getDocs(q1);
    const results = snap1.docs.map(d => ({ id: d.id, ...d.data() }));

    const q2 = query(collection(db, "apps"), where("addedBy.uid", "==", ownerId));
    const snap2 = await getDocs(q2);
    snap2.docs.forEach(d => {
      if (!results.some(r => r.id === d.id)) results.push({ id: d.id, ...d.data() });
    });

    return results;
  } catch (e) {
    console.error("Error getting apps by owner:", e);
    return [];
  }
}

export async function transferAppOwnership(appId, newOwnerId, newOwnerType, currentOwnerUid) {
  const appSnap = await getDoc(doc(db, "apps", appId));
  if (!appSnap.exists()) throw new Error("App not found");

  const app = appSnap.data();
  const isOwner = app.addedBy?.uid === currentOwnerUid || app.ownerId === currentOwnerUid;
  if (!isOwner) {
    const user = await getUserRecord(currentOwnerUid);
    if (!user || !["admin", "openlib-team"].includes(user.role)) throw new Error("Unauthorized");
  }

  const now = new Date().toISOString();
  await updateDoc(doc(db, "apps", appId), { ownerId: newOwnerId, ownerType: newOwnerType, updatedAt: now });

  await addDoc(collection(db, "app_versions"), {
    appId,
    type: "ownership_transfer",
    changes: { ownerId: { old: app.ownerId || app.addedBy?.uid, new: newOwnerId } },
    commitMessage: `Ownership transferred to ${newOwnerType}: ${newOwnerId}`,
    authorUid: currentOwnerUid,
    createdAt: now
  });
}

// ── App Version History ──────────────────────────────────────────────────────

export async function createAppVersion(appId, changes, commitMessage, authorUid) {
  const now = new Date().toISOString();
  const user = await getUserRecord(authorUid);
  const version = {
    appId,
    changes,
    commitMessage,
    authorUid,
    authorName: user?.displayName || "Unknown",
    authorPhoto: user?.photoURL || "",
    type: "edit",
    createdAt: now
  };
  const ref = await addDoc(collection(db, "app_versions"), version);
  return { id: ref.id, ...version };
}

export async function getAppVersions(appId) {
  try {
    const q = query(collection(db, "app_versions"), where("appId", "==", appId), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Error getting app versions:", e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ENHANCED EDIT REQUESTS — PR Workflow with Reviews
// ═══════════════════════════════════════════════════════════════════════════════

export async function addReviewComment(editRequestId, commentText, user) {
  const now = new Date().toISOString();
  const comment = {
    editRequestId,
    text: commentText,
    authorUid: user.uid,
    authorName: user.displayName || "Anonymous",
    authorPhoto: user.photoURL || "",
    type: "comment",
    createdAt: now
  };
  const ref = await addDoc(collection(db, "review_comments"), comment);
  return { id: ref.id, ...comment };
}

export async function getReviewComments(editRequestId) {
  try {
    const q = query(
      collection(db, "review_comments"),
      where("editRequestId", "==", editRequestId),
      orderBy("createdAt", "asc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Error getting review comments:", e);
    return [];
  }
}

export async function approveEditRequest(editRequestId, reviewerUid) {
  const reviewer = await getUserRecord(reviewerUid);
  if (!reviewer || !["maintainer", "admin", "openlib-team"].includes(reviewer.role)) {
    throw new Error("Only maintainers and admins can approve edit requests");
  }

  const now = new Date().toISOString();
  const erRef = doc(db, "edit_requests", editRequestId);
  const erSnap = await getDoc(erRef);
  if (!erSnap.exists()) throw new Error("Edit request not found");

  const er = erSnap.data();
  const approvals = er.approvals || [];
  if (approvals.includes(reviewerUid)) throw new Error("Already approved");

  await updateDoc(erRef, { approvals: [...approvals, reviewerUid], updatedAt: now });

  await addDoc(collection(db, "review_comments"), {
    editRequestId,
    text: "Approved this edit request",
    authorUid: reviewerUid,
    authorName: reviewer.displayName,
    authorPhoto: reviewer.photoURL || "",
    type: "approval",
    createdAt: now
  });

  await incrementActivity(reviewerUid, "reviewsDone");
}

export async function mergeEditRequest(editRequestId, mergerUid) {
  const merger = await getUserRecord(mergerUid);
  if (!merger || !["admin", "openlib-team"].includes(merger.role)) {
    throw new Error("Only admins can merge edit requests");
  }

  const erRef = doc(db, "edit_requests", editRequestId);
  const erSnap = await getDoc(erRef);
  if (!erSnap.exists()) throw new Error("Edit request not found");

  const er = erSnap.data();
  if (er.status !== "open") throw new Error("Edit request is not open");

  const now = new Date().toISOString();
  const appRef = doc(db, "apps", er.appId);
  const appSnap = await getDoc(appRef);
  if (!appSnap.exists()) throw new Error("App not found");

  const oldData = appSnap.data();
  const changes = { ...er.changes };
  delete changes.reason;

  const versionChanges = {};
  Object.keys(changes).forEach(key => {
    versionChanges[key] = { old: oldData[key], new: changes[key] };
  });

  await updateDoc(appRef, { ...changes, updatedAt: now });
  await createAppVersion(er.appId, versionChanges,
    `Merged edit request: ${er.changes.reason || "No reason provided"}`, mergerUid);

  await updateDoc(erRef, { status: "merged", mergedBy: mergerUid, mergedAt: now, updatedAt: now });

  await addDoc(collection(db, "review_comments"), {
    editRequestId,
    text: "Merged this edit request",
    authorUid: mergerUid,
    authorName: merger.displayName,
    authorPhoto: merger.photoURL || "",
    type: "merge",
    createdAt: now
  });
}

export async function rejectEditRequest(editRequestId, reviewerUid, reason) {
  const reviewer = await getUserRecord(reviewerUid);
  if (!reviewer || !["maintainer", "admin", "openlib-team"].includes(reviewer.role)) {
    throw new Error("Unauthorized");
  }

  const now = new Date().toISOString();
  await updateDoc(doc(db, "edit_requests", editRequestId), {
    status: "closed",
    closedBy: reviewerUid,
    closeReason: reason,
    updatedAt: now
  });

  await addDoc(collection(db, "review_comments"), {
    editRequestId,
    text: reason || "Rejected",
    authorUid: reviewerUid,
    authorName: reviewer.displayName,
    authorPhoto: reviewer.photoURL || "",
    type: "rejection",
    createdAt: now
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export async function trackActivity(uid, action, data) {
  try {
    await addDoc(collection(db, "user_activity"), {
      uid,
      action,
      ...data,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("Error tracking activity:", e);
  }
}

async function incrementActivity(uid, field) {
  try {
    await updateDoc(doc(db, "user_records", uid), {
      [`activity.${field}`]: increment(1),
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error("Error incrementing activity:", e);
  }
}

export function computeRecommendations(allApps, ratingsCache, userRecord) {
  if (!allApps.length) return [];

  const prefCats = userRecord?.preferences?.categories || [];
  const prefPlats = userRecord?.preferences?.platforms || [];

  const scored = allApps.map(app => {
    let score = 0;

    // Category affinity (40%)
    if (prefCats.length > 0 && prefCats.includes(app.category)) score += 40;

    // Popularity (30%)
    const r = ratingsCache[app.id] || {};
    const pop = ((r.avg || 0) * 4) + ((r.total || 0) * 2) + ((app.likes || 0) * 1.5) + ((app.views || 0) * 0.01);
    score += Math.min(30, pop);

    // Freshness (15%)
    if (app.createdAt) {
      const days = (Date.now() - new Date(app.createdAt).getTime()) / 86400000;
      score += Math.max(0, 15 - (days * 0.1));
    }

    // Platform match (15%)
    if (prefPlats.length > 0 && app.platforms?.some(p => prefPlats.includes(p))) score += 15;

    // Discovery bonus
    if (prefCats.length > 0 && !prefCats.includes(app.category)) score += 5;

    return { ...app, _recScore: score };
  });

  scored.sort((a, b) => b._recScore - a._recScore);
  return scored.slice(0, 8);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN / OPENLIB TEAM CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════

export async function isAdminOrTeam(uid) {
  const user = await getUserRecord(uid);
  return user && ["admin", "openlib-team"].includes(user.role);
}

export async function adminAddApp(appData, adminUid) {
  if (!(await isAdminOrTeam(adminUid))) throw new Error("Unauthorized");

  const admin = await getUserRecord(adminUid);
  const now = new Date().toISOString();
  const id = appData.id || appData.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const existing = await getDoc(doc(db, "apps", id));
  if (existing.exists()) throw new Error("App with this ID already exists");

  const fullData = {
    ...appData,
    id,
    likes: 0,
    dislikes: 0,
    views: 0,
    addedBy: { type: "openlib-team", name: "OpenLib Team", uid: adminUid },
    ownerType: "openlib-team",
    ownerId: adminUid,
    createdAt: now,
    updatedAt: now
  };

  await setDoc(doc(db, "apps", id), fullData);

  await addDoc(collection(db, "app_versions"), {
    appId: id,
    type: "initial",
    changes: {},
    commitMessage: "Initial app listing by OpenLib Team",
    authorUid: adminUid,
    authorName: admin?.displayName || "Admin",
    createdAt: now
  });

  await incrementActivity(adminUid, "appsAdded");
  return { id, ...fullData };
}

export async function adminUpdateApp(appId, data, adminUid) {
  if (!(await isAdminOrTeam(adminUid))) throw new Error("Unauthorized");

  const appRef = doc(db, "apps", appId);
  const appSnap = await getDoc(appRef);
  if (!appSnap.exists()) throw new Error("App not found");

  const oldData = appSnap.data();
  const now = new Date().toISOString();
  const versionChanges = {};
  Object.keys(data).forEach(key => {
    if (JSON.stringify(oldData[key]) !== JSON.stringify(data[key])) {
      versionChanges[key] = { old: oldData[key], new: data[key] };
    }
  });

  await updateDoc(appRef, { ...data, updatedAt: now });

  if (Object.keys(versionChanges).length > 0) {
    await createAppVersion(appId, versionChanges, "Admin override edit", adminUid);
  }
}

export async function adminRemoveApp(appId, adminUid) {
  if (!(await isAdminOrTeam(adminUid))) throw new Error("Unauthorized");
  await deleteDoc(doc(db, "apps", appId));
}

export async function getAllPendingSubmissions() {
  try {
    const q = query(collection(db, "submissions"), where("status", "==", "pending"), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Error getting submissions:", e);
    return [];
  }
}

export async function getAllEditRequests(statusFilter) {
  try {
    let q;
    if (statusFilter) {
      q = query(collection(db, "edit_requests"), where("status", "==", statusFilter), orderBy("createdAt", "desc"));
    } else {
      q = query(collection(db, "edit_requests"), orderBy("createdAt", "desc"));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Error getting all edit requests:", e);
    return [];
  }
}

export async function approveSubmission(submissionId, adminUid) {
  if (!(await isAdminOrTeam(adminUid))) throw new Error("Unauthorized");

  const subRef = doc(db, "submissions", submissionId);
  const subSnap = await getDoc(subRef);
  if (!subSnap.exists()) throw new Error("Submission not found");

  const sub = subSnap.data();
  if (sub.status !== "pending") throw new Error("Already processed");

  const now = new Date().toISOString();
  const admin = await getUserRecord(adminUid);
  const id = sub.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const appData = {
    name: sub.name,
    logo: sub.logo || "",
    category: sub.category,
    description: sub.description,
    uses: sub.uses,
    alternative: sub.alternative,
    download: sub.download,
    source: sub.source,
    maintainer: sub.maintainer,
    platforms: sub.platforms || [],
    likes: 0,
    dislikes: 0,
    views: 0,
    addedBy: { type: "user", name: "User", uid: sub.userId },
    ownerType: sub.ownerType || "user",
    ownerId: sub.ownerId || sub.userId,
    createdAt: now,
    updatedAt: now,
    version: "1.0.0"
  };

  await setDoc(doc(db, "apps", id), appData);
  await updateDoc(subRef, { status: "approved", reviewedBy: adminUid, reviewedAt: now });

  await addDoc(collection(db, "app_versions"), {
    appId: id,
    type: "initial",
    changes: {},
    commitMessage: `App submitted by user, approved by ${admin?.displayName || "admin"}`,
    authorUid: sub.userId,
    createdAt: now
  });

  return { id, ...appData };
}

export async function rejectSubmission(submissionId, adminUid, reason) {
  if (!(await isAdminOrTeam(adminUid))) throw new Error("Unauthorized");
  await updateDoc(doc(db, "submissions", submissionId), {
    status: "rejected",
    reviewedBy: adminUid,
    rejectReason: reason,
    reviewedAt: new Date().toISOString()
  });
}
