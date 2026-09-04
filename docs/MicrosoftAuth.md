# Microsoft Authentication

Relax Zone Launcher uses Microsoft's OAuth flow to authenticate Minecraft accounts.

## Acquiring an Entra Client ID

1. Navigate to https://portal.azure.com.
2. In the search bar, search for **Microsoft Entra ID**.
3. In Microsoft Entra ID, open **App Registrations** under **Manage**.
4. Click **New Registration**.
   - Set **Name** to the launcher's name.
   - Set **Supported account types** to *Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)*.
   - Leave **Redirect URI** blank, then register the application.
5. Open the application you registered and select **Authentication**.
6. Click **Add Platform** and select **Mobile and desktop applications**.
   - Add `https://login.microsoftonline.com/common/oauth2/nativeclient` as the redirect URI.
7. Open **Certificates & secrets** and create a client secret. The launcher does not need the secret value, but Microsoft requires a secret to be created for this application type.
8. Return to **Overview** and copy the **Application (client) ID**.

## Adding the Entra Client ID

In `app/assets/js/ipcconstants.js`, find **`AZURE_CLIENT_ID`** and set it to the application ID.

The Entra Client ID is not a secret and may be stored in source control. See Microsoft's guidance for the account type and OAuth configuration.

Restart the launcher and try to log in once before requesting verification. Microsoft may initially reject an unverified application until it has activity.

## Requesting verification from Microsoft

1. Confirm that every step above is complete.
2. Submit the application through [Microsoft's app verification form](https://aka.ms/mce-reviewappid).
3. Provide the Client ID and Tenant ID shown in the Azure Portal.
4. Allow time for the review and up to 24 hours for the approval to take effect.

References:

- https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app
- https://help.minecraft.net/hc/en-us/articles/16254801392141
