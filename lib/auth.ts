import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { redirect } from "next/navigation";

export async function getAuthenticatedUser() {
  const { getUser, isAuthenticated } = getKindeServerSession();
  
  if (!await isAuthenticated()) {
    redirect("/api/auth/login");
  }
  
  const user = await getUser();
  if (!user) {
    redirect("/api/auth/login");
  }
  
  return user;
}

export async function getUserId() {
  const user = await getAuthenticatedUser();
  return user.id;
}

export async function getUserDetails() {
  const { getUser, isAuthenticated, getPermissions, getOrganization } = getKindeServerSession();
  
  if (!await isAuthenticated()) {
    redirect("/api/auth/login");
  }
  
  const user = await getUser();
  if (!user) {
    redirect("/api/auth/login");
  }

  const permissions = await getPermissions();
  const organization = await getOrganization();

  return {
    id: user.id,
    email: user.email,
    firstName: user.given_name,
    lastName: user.family_name,
    fullName: `${user.given_name || ''} ${user.family_name || ''}`.trim(),
    picture: user.picture,
    permissions,
    organization,
    isVerified: user.email_verified,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

export async function checkAuthentication() {
  const { isAuthenticated } = getKindeServerSession();
  return await isAuthenticated();
}