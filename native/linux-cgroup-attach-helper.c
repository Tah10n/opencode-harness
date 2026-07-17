/*
 * Copyright (c) 2026 opencode-harness contributors.
 * SPDX-License-Identifier: MIT
 *
 * Root-owned, fixed-destination cgroup-v2 attachment helper. The build embeds
 * both the dedicated workload UID and the only writable cgroup.procs target.
 * The caller supplies a PID, its /proc start ticks, and the one-shot IPC
 * challenge that was answered by the still-idle worker. The raw challenge is
 * bounded protocol data passed in argv and echoed on the captured helper
 * stdout; it is never copied into durable identity or receipt data, which
 * stores only its SHA-256 fingerprint.
 */

#define _GNU_SOURCE

#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#ifndef OPENCODE_EXPECTED_UID
#error "OPENCODE_EXPECTED_UID must be embedded at build time"
#endif

#ifndef OPENCODE_CGROUP_CONTROL
#error "OPENCODE_CGROUP_CONTROL must be embedded at build time"
#endif

#define MAX_PROC_BYTES 16384U
#define CHALLENGE_BYTES 43U
#define STOP_ATTEMPTS 200U

struct process_identity {
  uid_t real_uid;
  unsigned long long start_ticks;
  char state;
};

static bool parse_unsigned(const char *text, unsigned long long maximum, unsigned long long *result) {
  if (text == NULL || text[0] == '\0') return false;
  for (const unsigned char *cursor = (const unsigned char *)text; *cursor != '\0'; cursor += 1) {
    if (!isdigit(*cursor)) return false;
  }
  errno = 0;
  char *end = NULL;
  const unsigned long long parsed = strtoull(text, &end, 10);
  if (errno != 0 || end == text || *end != '\0' || parsed == 0 || parsed > maximum) return false;
  *result = parsed;
  return true;
}

static bool valid_challenge(const char *value) {
  if (value == NULL || strlen(value) != CHALLENGE_BYTES) return false;
  for (size_t index = 0; index < CHALLENGE_BYTES; index += 1U) {
    const unsigned char current = (unsigned char)value[index];
    if (!(isalnum(current) || current == '_' || current == '-')) return false;
  }
  return true;
}

static int read_bounded_file(const char *candidate, char *buffer, size_t capacity) {
  const int descriptor = open(candidate, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (descriptor < 0) return -1;
  size_t used = 0;
  while (used + 1U < capacity) {
    const ssize_t count = read(descriptor, &buffer[used], capacity - used - 1U);
    if (count == 0) break;
    if (count < 0) {
      if (errno == EINTR) continue;
      const int saved_errno = errno;
      (void)close(descriptor);
      errno = saved_errno;
      return -1;
    }
    used += (size_t)count;
  }
  char overflow;
  const ssize_t extra = read(descriptor, &overflow, 1U);
  const int saved_errno = errno;
  (void)close(descriptor);
  if (extra != 0) {
    errno = extra < 0 ? saved_errno : E2BIG;
    return -1;
  }
  buffer[used] = '\0';
  return 0;
}

static int read_process_identity(pid_t pid, struct process_identity *result) {
  char status_path[64];
  char stat_path[64];
  if (snprintf(status_path, sizeof(status_path), "/proc/%d/status", pid) < 1
      || snprintf(stat_path, sizeof(stat_path), "/proc/%d/stat", pid) < 1) {
    errno = EINVAL;
    return -1;
  }
  char status[MAX_PROC_BYTES];
  char stat[MAX_PROC_BYTES];
  if (read_bounded_file(status_path, status, sizeof(status)) != 0
      || read_bounded_file(stat_path, stat, sizeof(stat)) != 0) return -1;

  char *uid_line = strstr(status, "Uid:");
  if (uid_line == NULL || (uid_line != status && uid_line[-1] != '\n')) {
    errno = EPROTO;
    return -1;
  }
  uid_line += 4;
  while (*uid_line == ' ' || *uid_line == '\t') uid_line += 1;
  char *uid_end = uid_line;
  while (isdigit((unsigned char)*uid_end)) uid_end += 1;
  const char saved = *uid_end;
  *uid_end = '\0';
  unsigned long long uid_value = 0;
  const bool uid_valid = parse_unsigned(uid_line, UINT_MAX, &uid_value);
  *uid_end = saved;
  if (!uid_valid) {
    errno = EPROTO;
    return -1;
  }

  char *close = strrchr(stat, ')');
  if (close == NULL || close[1] != ' ') {
    errno = EPROTO;
    return -1;
  }
  char *cursor = close + 2;
  char *save = NULL;
  char *token = strtok_r(cursor, " ", &save);
  unsigned int field = 3U;
  char state = '\0';
  unsigned long long start_ticks = 0;
  while (token != NULL && field <= 22U) {
    if (field == 3U && strlen(token) == 1U) state = token[0];
    if (field == 22U && !parse_unsigned(token, ULLONG_MAX, &start_ticks)) {
      errno = EPROTO;
      return -1;
    }
    token = strtok_r(NULL, " ", &save);
    field += 1U;
  }
  if (state == '\0' || start_ticks == 0) {
    errno = EPROTO;
    return -1;
  }
  *result = (struct process_identity) {
    .real_uid = (uid_t)uid_value,
    .start_ticks = start_ticks,
    .state = state,
  };
  return 0;
}

static int pidfd_open_bound(pid_t pid) {
#ifdef SYS_pidfd_open
  return (int)syscall(SYS_pidfd_open, pid, 0U);
#else
  errno = ENOSYS;
  return -1;
#endif
}

static int pidfd_signal(int pidfd, int signal_number) {
#ifdef SYS_pidfd_send_signal
  return (int)syscall(SYS_pidfd_send_signal, pidfd, signal_number, NULL, 0U);
#else
  (void)pidfd;
  (void)signal_number;
  errno = ENOSYS;
  return -1;
#endif
}

static bool identity_matches(const struct process_identity *identity, unsigned long long start_ticks) {
  return identity->real_uid == (uid_t)OPENCODE_EXPECTED_UID && identity->start_ticks == start_ticks;
}

static bool control_contains_pid(pid_t pid) {
  char content[MAX_PROC_BYTES];
  if (read_bounded_file(OPENCODE_CGROUP_CONTROL, content, sizeof(content)) != 0) return false;
  char *save = NULL;
  for (char *line = strtok_r(content, "\n", &save); line != NULL; line = strtok_r(NULL, "\n", &save)) {
    unsigned long long observed = 0;
    if (parse_unsigned(line, INT_MAX, &observed) && (pid_t)observed == pid) return true;
  }
  return false;
}

int main(int argc, char **argv) {
  if (argc != 4 || geteuid() != 0 || getuid() != 0 || !valid_challenge(argv[3])) return 64;
  unsigned long long sudo_uid = 0;
  unsigned long long parsed_pid = 0;
  unsigned long long expected_start_ticks = 0;
  if (!parse_unsigned(getenv("SUDO_UID"), UINT_MAX, &sudo_uid)
      || sudo_uid != (unsigned long long)OPENCODE_EXPECTED_UID
      || !parse_unsigned(argv[1], INT_MAX, &parsed_pid)
      || !parse_unsigned(argv[2], ULLONG_MAX, &expected_start_ticks)) return 77;
  const pid_t pid = (pid_t)parsed_pid;

  struct process_identity identity;
  if (read_process_identity(pid, &identity) != 0 || !identity_matches(&identity, expected_start_ticks)) return 77;
  const int pidfd = pidfd_open_bound(pid);
  if (pidfd < 0) return 78;
  bool stopped = false;
  int result = 1;
  int control = -1;
  if (pidfd_signal(pidfd, SIGSTOP) != 0) goto cleanup;
  stopped = true;
  for (unsigned int attempt = 0; attempt < STOP_ATTEMPTS; attempt += 1U) {
    if (read_process_identity(pid, &identity) != 0 || !identity_matches(&identity, expected_start_ticks)) goto cleanup;
    if (identity.state == 'T' || identity.state == 't') break;
    if (attempt + 1U == STOP_ATTEMPTS) goto cleanup;
    const struct timespec interval = { .tv_sec = 0, .tv_nsec = 5000000L };
    (void)nanosleep(&interval, NULL);
  }
  control = open(OPENCODE_CGROUP_CONTROL, O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
  if (control < 0) goto cleanup;
  struct stat metadata;
  if (fstat(control, &metadata) != 0 || !S_ISREG(metadata.st_mode)) goto cleanup;
  char line[64];
  const int length = snprintf(line, sizeof(line), "%d\n", pid);
  if (length < 1 || (size_t)length >= sizeof(line)) goto cleanup;
  ssize_t written;
  do { written = write(control, line, (size_t)length); } while (written < 0 && errno == EINTR);
  if (written != length) goto cleanup;
  if (read_process_identity(pid, &identity) != 0 || !identity_matches(&identity, expected_start_ticks)
      || !control_contains_pid(pid)) goto cleanup;
  if (pidfd_signal(pidfd, SIGCONT) != 0) goto cleanup;
  stopped = false;
  if (printf("ATTACHED:%d:%llu:%s\n", pid, expected_start_ticks, argv[3]) < 1 || fflush(stdout) != 0) goto cleanup;
  result = 0;

cleanup:
  if (control >= 0) (void)close(control);
  if (stopped) (void)pidfd_signal(pidfd, SIGCONT);
  (void)close(pidfd);
  return result;
}
