/*
 * PAM authentication helper for UPGS Node Panel.
 * Compile: gcc -o auth-pam auth-pam.c -lpam
 * Run: PAM_USER=username PAM_PASSWORD=password ./auth-pam
 * Exit 0 on success, 1 on failure.
 */
#define _GNU_SOURCE
#include <security/pam_appl.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static const char *g_password;

static int conversation(int n, const struct pam_message **msg,
    struct pam_response **resp, void *data) {
  (void)data;
  if (n <= 0 || n > 128) return PAM_CONV_ERR;
  *resp = calloc(n, sizeof(struct pam_response));
  if (!*resp) return PAM_BUF_ERR;
  for (int i = 0; i < n; i++) {
    (*resp)[i].resp_retcode = 0;
    (*resp)[i].resp = NULL;
    if (msg[i]->msg_style == PAM_PROMPT_ECHO_OFF && g_password)
      (*resp)[i].resp = strdup(g_password);
  }
  return PAM_SUCCESS;
}

static struct pam_conv conv = {
  .conv = conversation,
  .appdata_ptr = NULL
};

int main(int argc, char **argv) {
  const char *user = getenv("PAM_USER");
  const char *pass = getenv("PAM_PASSWORD");
  if (argc >= 2) user = argv[1];
  if (argc >= 3) pass = argv[2];
  if (!user || !pass) return 1;
  g_password = pass;

  pam_handle_t *pamh = NULL;
  int ret = pam_start("login", user, &conv, &pamh);
  if (ret != PAM_SUCCESS) goto out;
  ret = pam_authenticate(pamh, 0);
  if (ret != PAM_SUCCESS) goto out;
  ret = pam_acct_mgmt(pamh, 0);
out:
  if (pamh) pam_end(pamh, ret);
  return ret == PAM_SUCCESS ? 0 : 1;
}
