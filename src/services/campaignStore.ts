const campaignByPhone = new Map<string, string>();

export function rememberCampaign(phone: string, campaignKey: string): void {
  campaignByPhone.set(phone, campaignKey);
}

export function getCampaignForPhone(phone: string): string | null {
  return campaignByPhone.get(phone) ?? null;
}
