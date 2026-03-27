// ── Firebase Configuration ────────────────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, GithubAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, doc, setDoc, getDoc, orderBy, limit, increment, deleteDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBFgiUsJBK2fFGCiTTQHHlkZ6Lo7clXFfg",
  authDomain: "openlib-f7bf1.firebaseapp.com",
  projectId: "openlib-f7bf1",
  storageBucket: "openlib-f7bf1.firebasestorage.app",
  messagingSenderId: "480795071552",
  appId: "1:480795071552:web:46b203a9cacd196292bba5",
  measurementId: "G-TRYB22NJBL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Auth providers
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

// ── Auth Helpers ──────────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Google sign-in error:", error);
    throw new Error(error.message);
  }
}

export async function signInWithGitHub() {
  try {
    const result = await signInWithPopup(auth, githubProvider);
    return result.user;
  } catch (error) {
    console.error("GitHub sign-in error:", error);
    throw new Error(error.message);
  }
}

export async function signOutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign-out error:", error);
    throw new Error(error.message);
  }
}

export function getCurrentUser() {
  return auth.currentUser;
}

export function onUserAuthStateChanged(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── Firestore Helpers ─────────────────────────────────────────────────────────

export async function submitReportToFirestore(appId, appName, reason, details, userId) {
  try {
    await addDoc(collection(db, "reports"), {
      appId,
      appName,
      reason,
      details,
      userId,
      timestamp: new Date().toISOString(),
      status: "pending"
    });
  } catch (error) {
    console.error("Error submitting report:", error);
    throw error;
  }
}

export async function submitAppToFirestore(payload, userId) {
  try {
    await addDoc(collection(db, "submissions"), {
      ...payload,
      userId,
      timestamp: new Date().toISOString(),
      status: "pending"
    });
  } catch (error) {
    console.error("Error submitting app:", error);
    throw error;
  }
}

// ── App CRUD ──────────────────────────────────────────────────────────────────

export async function getAllAppsFromFirestore() {
  try {
    const snapshot = await getDocs(collection(db, "apps"));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error getting apps:", error);
    return [];
  }
}

export async function getAppFromFirestore(appId) {
  try {
    const docSnap = await getDoc(doc(db, "apps", appId));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error("Error getting app:", error);
    return null;
  }
}

// ── Views ─────────────────────────────────────────────────────────────────────

export async function incrementAppViews(appId, userId) {
  try {
    const appRef = doc(db, "apps", appId);

    if (userId) {
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const viewsRef = collection(db, "app_views");
        const q = query(
          viewsRef,
          where("appId", "==", appId),
          where("userId", "==", userId),
          where("timestamp", ">", oneHourAgo),
          limit(1)
        );
        const existing = await getDocs(q);
        if (!existing.empty) {
          const snap = await getDoc(appRef);
          return snap.data()?.views || 0;
        }
        await addDoc(collection(db, "app_views"), {
          appId,
          userId,
          timestamp: new Date().toISOString()
        });
      } catch (viewErr) {
        console.warn("View throttle check failed (missing index?), incrementing anyway:", viewErr);
      }
    }

    await updateDoc(appRef, { views: increment(1) });
    const updated = await getDoc(appRef);
    return updated.data()?.views || 0;
  } catch (error) {
    console.error("Error incrementing views:", error);
    return 0;
  }
}

// ── Likes / Dislikes ──────────────────────────────────────────────────────────

export async function toggleVote(appId, userId, voteType) {
  try {
    const votesRef = collection(db, "app_votes");
    const q = query(votesRef, where("appId", "==", appId), where("userId", "==", userId));
    const snapshot = await getDocs(q);
    const appRef = doc(db, "apps", appId);

    if (!snapshot.empty) {
      const existingVote = snapshot.docs[0];
      const existingType = existingVote.data().type;

      if (existingType === voteType) {
        await deleteDoc(existingVote.ref);
        await updateDoc(appRef, {
          [voteType === "like" ? "likes" : "dislikes"]: increment(-1)
        });
        return { action: "removed", type: voteType };
      } else {
        await updateDoc(existingVote.ref, { type: voteType, timestamp: new Date().toISOString() });
        await updateDoc(appRef, {
          [existingType === "like" ? "likes" : "dislikes"]: increment(-1),
          [voteType === "like" ? "likes" : "dislikes"]: increment(1)
        });
        return { action: "switched", type: voteType };
      }
    } else {
      await addDoc(votesRef, { appId, userId, type: voteType, timestamp: new Date().toISOString() });
      await updateDoc(appRef, {
        [voteType === "like" ? "likes" : "dislikes"]: increment(1)
      });
      return { action: "added", type: voteType };
    }
  } catch (error) {
    console.error("Error toggling vote:", error);
    throw error;
  }
}

export async function getUserVote(appId, userId) {
  try {
    const q = query(
      collection(db, "app_votes"),
      where("appId", "==", appId),
      where("userId", "==", userId)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0].data().type;
    }
    return null;
  } catch (error) {
    console.error("Error getting user vote:", error);
    return null;
  }
}

// ── Seed Apps ─────────────────────────────────────────────────────────────────

export async function seedAppsToFirestore(appsArray) {
  let count = 0;
  for (const app of appsArray) {
    const existing = await getDoc(doc(db, "apps", app.id));
    if (!existing.exists()) {
      await setDoc(doc(db, "apps", app.id), {
        ...app,
        likes: 0,
        dislikes: 0,
        views: 0,
        addedBy: { type: "openlib-team", name: "OpenLib Team" },
        createdAt: new Date().toISOString()
      });
      count++;
    }
  }
  return count;
}

// ── Edit Requests (Pull-Request style) ────────────────────────────────────────

export async function submitEditRequest(appId, changes, user) {
  try {
    const editRef = await addDoc(collection(db, "edit_requests"), {
      appId,
      changes,
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      submitter: {
        uid: user.uid,
        displayName: user.displayName || "Anonymous",
        email: user.email || "",
        photoURL: user.photoURL || "",
        provider: user.providerData?.[0]?.providerId || "unknown"
      }
    });
    return editRef.id;
  } catch (error) {
    console.error("Error submitting edit request:", error);
    throw error;
  }
}

export async function getEditRequestsForApp(appId) {
  try {
    const q = query(
      collection(db, "edit_requests"),
      where("appId", "==", appId),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error getting edit requests:", error);
    return [];
  }
}

export async function getUserEditRequests(userId) {
  try {
    const q = query(
      collection(db, "edit_requests"),
      where("submitter.uid", "==", userId),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error getting user edit requests:", error);
    return [];
  }
}

export { auth, db, app, storage };

// ── Storage: Logo Upload ──────────────────────────────────────────────────────
export async function uploadLogoToStorage(file, appName) {
  const allowed = ['image/jpeg', 'image/png', 'image/svg+xml'];
  if (!allowed.includes(file.type)) throw new Error('Invalid file type. Use JPG, PNG, or SVG.');
  if (file.size > 2 * 1024 * 1024) throw new Error('File too large. Max 2 MB.');
  const ext = file.name.split('.').pop().toLowerCase();
  const safeName = appName.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
  const path = `logos/${safeName}_${Date.now()}.${ext}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
}
