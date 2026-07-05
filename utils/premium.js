export const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'vamsinaramala30@gmail.com').trim().toLowerCase();
export const OWNER_PLAN = 'OWNER_PREMIUM';
export const OWNER_ROLE = 'OWNER';

export function isOwnerEmail(email) {
  return String(email || '').trim().toLowerCase() === OWNER_EMAIL;
}

export function normalizePlan(plan) {
  if (!plan) return 'FREE';
  return String(plan).trim().toUpperCase();
}

export function getEffectivePlan(user) {
  if (!user) return 'FREE';
  if (isOwnerEmail(user.email)) return OWNER_PLAN;
  return normalizePlan(user.plan);
}

export function getEffectiveSubscriptionStatus(user) {
  if (!user) return 'inactive';
  if (isOwnerEmail(user.email)) return 'active';
  return String(user.subscriptionStatus || 'inactive').trim().toLowerCase();
}

export function isActivePremium(user) {
  if (!user) return false;
  if (isOwnerEmail(user.email)) return true;

  const plan = getEffectivePlan(user);
  const status = getEffectiveSubscriptionStatus(user);
  if (plan !== 'PRO' || status !== 'active') return false;

  if (user.subscriptionEndDate) {
    const end = new Date(user.subscriptionEndDate);
    return end.getTime() > Date.now();
  }
  return true;
}

export function getEffectiveUserResponse(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    bio: user.bio,
    location: user.location,
    profession: user.profession,
    avatar: user.avatar,
    plan: getEffectivePlan(user),
    subscriptionStatus: getEffectiveSubscriptionStatus(user),
    subscriptionStartDate: user.subscriptionStartDate || null,
    subscriptionEndDate: user.subscriptionEndDate || null,
    role: isOwnerEmail(user.email) ? OWNER_ROLE : user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
    accountStatus: user.accountStatus,
  };
}
