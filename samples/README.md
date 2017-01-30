# **ito** application examples

## How-To

1. Copy *samples/* and *src/* directories under your web server.
    You can use *localhost*, as well.
1. Prepare *config.json* file by copying one of *config-template-\*.json* files,
    and edit it according to your environment (e.g. App ID, etc.).
2. Create account with email address and password at your backend service
    (i.e. Firebase or Kii Cloud), and configure the account as administrator.
    (see [API.md](../API.md))
3. Open *samples/client.html* and *samples/controller.html* at different browsers.
4. At *controller.html*, sign in with the administrator account.
5. To establish a paring between *client.html* and *controller.html*,
    input the passcode shown on *client.html* in the passcode input form
    on *controller.html*, and click *add* button.
6. When one or more parings exist, *controller.html* can send a command to change
    background color of each *client.html* by clicking buttons with color names.
    * When buttons on the right side of client's user ID are clicked,
      the background color of the single client is changed.
    * When buttons in *Notification to all clients* field are clicked,
      the backgound color of all clients is changed into the same specified color.
    * Notifications cause by the buttons in *Notification to all clients* field
      will remain two weeks, and the remaining notifications are sent to every client
      when it is loaded. This suggests that when *client.html* is reloaded without
      revoking its paring, its backgound color is automatically changed into the
      color specified by the button clicked the last before reloaded.