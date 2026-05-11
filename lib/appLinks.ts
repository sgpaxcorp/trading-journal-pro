export const IOS_APP_LINK_TEAM_ID = "2BWGA2LDRC";
export const IOS_APP_LINK_BUNDLE_ID = "com.sgpax.neurotraderjournal";
export const APP_LINK_HOSTS = ["www.neurotrader-journal.com", "neurotrader-journal.com"] as const;
export const APP_LINK_RESET_PATH = "/reset-password";

export function buildAppleAppSiteAssociation() {
  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [`${IOS_APP_LINK_TEAM_ID}.${IOS_APP_LINK_BUNDLE_ID}`],
          components: [
            {
              "/": `${APP_LINK_RESET_PATH}*`,
            },
          ],
        },
      ],
    },
  };
}
