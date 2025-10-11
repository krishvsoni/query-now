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