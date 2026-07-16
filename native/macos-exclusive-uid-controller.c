/*
 * Copyright (c) 2026 opencode-harness contributors.
 * SPDX-License-Identifier: MIT
 *
 * macOS has no public cgroup- or Job-Object-equivalent. This controller uses
 * an explicitly exclusive, unprivileged real UID as the inherited kernel
 * membership boundary. The coordinator and its already-running ancestors are
 * bound by PID plus process start time; every other live process with the UID
 * is stopped to a fixed point and killed. The host must dedicate the account
 * to one harness coordinator and install this executable outside the project
 * workspace as a root-owned, non-writable regular file.
 *
 * The executable is intentionally not privileged: the controller process runs
 * as the workload UID. This boundary is therefore for trusted project-owned
 * checks and lifecycle cleanup, not for adversarial same-UID code that attacks
 * the controller or attempts privilege/UID changes. A root-owned UID marker
 * explicitly authorizes preparation of the dedicated account, while a paired
 * workload-owned lease serializes probe/watch scopes for that UID.
 */

#ifndef __APPLE__
#error "macos-exclusive-uid-controller.c can only be built for macOS"
#endif

#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/proc.h>
#include <sys/stat.h>
#include <sys/sysctl.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#define CONTROLLER_PROTOCOL_VERSION 2
#define MAX_PROCESSES 4096U
#define MAX_ANCESTORS 64U
#define MAX_SCAN_BYTES (8U * 1024U * 1024U)
#define CONTROL_BYTES 16U
#define SETTLE_INTERVAL_NS 10000000L
#define MAX_CONFIG_PATH_BYTES 4096U

struct process_identity {
  pid_t pid;
  pid_t ppid;
  uid_t ruid;
  int64_t start_seconds;
  int32_t start_microseconds;
  unsigned char status;
};

struct process_list {
  struct process_identity *items;
  size_t count;
};

struct controller_scope {
  uid_t uid;
  struct process_identity self;
  struct process_identity worker;
  struct process_identity ancestors[MAX_ANCESTORS];
  size_t ancestor_count;
};

static volatile sig_atomic_t termination_requested = 0;

static void request_termination(int signal_number) {
  termination_requested = signal_number;
}

static void sleep_interval(void) {
  const struct timespec interval = { .tv_sec = 0, .tv_nsec = SETTLE_INTERVAL_NS };
  struct timespec remaining = interval;
  while (nanosleep(&remaining, &remaining) == -1 && errno == EINTR) {
    if (termination_requested != 0) {
      break;
    }
  }
}

static uint64_t monotonic_milliseconds(void) {
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) {
    return 0;
  }
  return ((uint64_t)now.tv_sec * 1000U) + ((uint64_t)now.tv_nsec / 1000000U);
}

static bool parse_positive_integer(const char *text, int64_t maximum, int64_t *result) {
  if (text == NULL || text[0] == '\0') {
    return false;
  }
  errno = 0;
  char *end = NULL;
  const intmax_t parsed = strtoimax(text, &end, 10);
  if (errno != 0 || end == text || *end != '\0' || parsed < 1 || parsed > maximum) {
    return false;
  }
  *result = (int64_t)parsed;
  return true;
}

static void free_process_list(struct process_list *list) {
  free(list->items);
  list->items = NULL;
  list->count = 0;
}

static int load_processes_for_uid(uid_t uid, struct process_list *result) {
  int mib[4] = { CTL_KERN, KERN_PROC, KERN_PROC_RUID, (int)uid };
  for (unsigned int attempt = 0; attempt < 8U; attempt += 1U) {
    size_t required = 0;
    if (sysctl(mib, 4U, NULL, &required, NULL, 0) != 0) {
      return -1;
    }
    if (required > MAX_SCAN_BYTES) {
      errno = E2BIG;
      return -1;
    }
    size_t capacity = required + (16U * sizeof(struct kinfo_proc));
    if (capacity < required || capacity > MAX_SCAN_BYTES) {
      capacity = MAX_SCAN_BYTES;
    }
    struct kinfo_proc *raw = calloc(1U, capacity == 0 ? sizeof(struct kinfo_proc) : capacity);
    if (raw == NULL) {
      return -1;
    }
    size_t actual = capacity;
    if (sysctl(mib, 4U, raw, &actual, NULL, 0) != 0) {
      const int saved_errno = errno;
      free(raw);
      if (saved_errno == ENOMEM) {
        continue;
      }
      errno = saved_errno;
      return -1;
    }
    if ((actual % sizeof(struct kinfo_proc)) != 0U) {
      free(raw);
      errno = EPROTO;
      return -1;
    }
    const size_t count = actual / sizeof(struct kinfo_proc);
    if (count > MAX_PROCESSES) {
      free(raw);
      errno = E2BIG;
      return -1;
    }
    struct process_identity *items = calloc(count == 0 ? 1U : count, sizeof(*items));
    if (items == NULL) {
      free(raw);
      return -1;
    }
    for (size_t index = 0; index < count; index += 1U) {
      items[index] = (struct process_identity) {
        .pid = raw[index].kp_proc.p_pid,
        .ppid = raw[index].kp_eproc.e_ppid,
        .ruid = raw[index].kp_eproc.e_pcred.p_ruid,
        .start_seconds = (int64_t)raw[index].kp_proc.p_starttime.tv_sec,
        .start_microseconds = (int32_t)raw[index].kp_proc.p_starttime.tv_usec,
        .status = (unsigned char)raw[index].kp_proc.p_stat,
      };
    }
    free(raw);
    result->items = items;
    result->count = count;
    return 0;
  }
  errno = EAGAIN;
  return -1;
}

static const struct process_identity *find_process(const struct process_list *list, pid_t pid) {
  for (size_t index = 0; index < list->count; index += 1U) {
    if (list->items[index].pid == pid) {
      return &list->items[index];
    }
  }
  return NULL;
}

static bool same_process(const struct process_identity *left, const struct process_identity *right) {
  return left->pid == right->pid
    && left->start_seconds == right->start_seconds
    && left->start_microseconds == right->start_microseconds;
}

static bool is_preserved(const struct controller_scope *scope, const struct process_identity *candidate) {
  if (same_process(&scope->self, candidate)) {
    return true;
  }
  for (size_t index = 0; index < scope->ancestor_count; index += 1U) {
    if (same_process(&scope->ancestors[index], candidate)) {
      return true;
    }
  }
  return false;
}

static bool is_excluded(
  const struct controller_scope *scope,
  const struct process_identity *candidate,
  bool preserve_worker
) {
  return is_preserved(scope, candidate)
    || (preserve_worker && same_process(&scope->worker, candidate));
}

static int capture_scope(pid_t coordinator_pid, pid_t worker_pid, bool probe, struct controller_scope *scope) {
  if (getuid() == 0 || geteuid() != getuid() || getppid() != coordinator_pid) {
    errno = EPERM;
    return -1;
  }
  scope->uid = getuid();
  struct process_list list = { 0 };
  if (load_processes_for_uid(scope->uid, &list) != 0) {
    return -1;
  }
  const struct process_identity *self = find_process(&list, getpid());
  const struct process_identity *coordinator = find_process(&list, coordinator_pid);
  if (self == NULL || coordinator == NULL || self->ppid != coordinator_pid) {
    free_process_list(&list);
    errno = ESRCH;
    return -1;
  }
  scope->self = *self;
  pid_t cursor = coordinator_pid;
  while (cursor > 1) {
    const struct process_identity *entry = find_process(&list, cursor);
    if (entry == NULL) {
      break;
    }
    if (scope->ancestor_count >= MAX_ANCESTORS) {
      free_process_list(&list);
      errno = E2BIG;
      return -1;
    }
    scope->ancestors[scope->ancestor_count] = *entry;
    scope->ancestor_count += 1U;
    if (entry->ppid == cursor) {
      free_process_list(&list);
      errno = ELOOP;
      return -1;
    }
    cursor = entry->ppid;
  }
  if (!probe) {
    const struct process_identity *worker = find_process(&list, worker_pid);
    if (worker == NULL || worker->ppid != coordinator_pid || worker->status == SZOMB) {
      free_process_list(&list);
      errno = ESRCH;
      return -1;
    }
    scope->worker = *worker;
  }
  free_process_list(&list);
  return 0;
}

static int assert_exclusive_scope(const struct controller_scope *scope, bool preserve_worker) {
  struct process_list list = { 0 };
  if (load_processes_for_uid(scope->uid, &list) != 0) {
    return -1;
  }
  const struct process_identity *self = find_process(&list, scope->self.pid);
  if (self == NULL || !same_process(self, &scope->self)) {
    free_process_list(&list);
    errno = ESRCH;
    return -1;
  }
  for (size_t index = 0; index < scope->ancestor_count; index += 1U) {
    const struct process_identity *ancestor = find_process(&list, scope->ancestors[index].pid);
    if (ancestor == NULL || !same_process(ancestor, &scope->ancestors[index])) {
      free_process_list(&list);
      errno = ESRCH;
      return -1;
    }
  }
  if (preserve_worker) {
    const struct process_identity *worker = find_process(&list, scope->worker.pid);
    if (worker == NULL || !same_process(worker, &scope->worker)) {
      free_process_list(&list);
      errno = ESRCH;
      return -1;
    }
  }
  for (size_t index = 0; index < list.count; index += 1U) {
    if (!is_excluded(scope, &list.items[index], preserve_worker)) {
      free_process_list(&list);
      errno = EBUSY;
      return -1;
    }
  }
  free_process_list(&list);
  return 0;
}

static int signal_process(pid_t pid, int signal_number) {
  if (kill(pid, signal_number) == 0 || errno == ESRCH) {
    return 0;
  }
  return -1;
}

static int terminate_scope(
  const struct controller_scope *scope,
  uint64_t timeout_milliseconds,
  bool preserve_worker,
  uint64_t *scan_count,
  size_t *remaining_zombies
) {
  const uint64_t started = monotonic_milliseconds();
  if (started == 0) {
    errno = EIO;
    return -1;
  }
  const uint64_t deadline = started + timeout_milliseconds;
  bool quiesced = false;
  while (monotonic_milliseconds() < deadline) {
    struct process_list list = { 0 };
    if (load_processes_for_uid(scope->uid, &list) != 0) {
      return -1;
    }
    *scan_count += 1U;
    size_t live_targets = 0;
    bool all_stopped = true;
    for (size_t index = 0; index < list.count; index += 1U) {
      const struct process_identity *candidate = &list.items[index];
      if (is_excluded(scope, candidate, preserve_worker) || candidate->status == SZOMB) {
        continue;
      }
      live_targets += 1U;
      if (candidate->status != SSTOP) {
        all_stopped = false;
        if (signal_process(candidate->pid, SIGSTOP) != 0) {
          free_process_list(&list);
          return -1;
        }
      }
    }
    free_process_list(&list);
    if (live_targets == 0U || all_stopped) {
      quiesced = true;
      break;
    }
    sleep_interval();
  }
  if (!quiesced) {
    errno = ETIMEDOUT;
    return -1;
  }

  unsigned int empty_observations = 0U;
  while (monotonic_milliseconds() < deadline) {
    struct process_list list = { 0 };
    if (load_processes_for_uid(scope->uid, &list) != 0) {
      return -1;
    }
    *scan_count += 1U;
    size_t live_targets = 0;
    size_t zombies = 0;
    for (size_t index = 0; index < list.count; index += 1U) {
      const struct process_identity *candidate = &list.items[index];
      if (is_excluded(scope, candidate, preserve_worker)) {
        continue;
      }
      if (candidate->status == SZOMB) {
        zombies += 1U;
        continue;
      }
      live_targets += 1U;
      if (signal_process(candidate->pid, SIGKILL) != 0) {
        free_process_list(&list);
        return -1;
      }
    }
    free_process_list(&list);
    *remaining_zombies = zombies;
    if (live_targets == 0U && zombies == 0U) {
      empty_observations += 1U;
      if (empty_observations >= 2U) {
        return 0;
      }
    } else {
      empty_observations = 0U;
    }
    sleep_interval();
  }
  errno = ETIMEDOUT;
  return -1;
}

static bool read_close_request(void) {
  char control[CONTROL_BYTES + 1U];
  size_t used = 0;
  while (used < CONTROL_BYTES) {
    const ssize_t received = read(STDIN_FILENO, &control[used], CONTROL_BYTES - used);
    if (received == 0) {
      return true;
    }
    if (received < 0) {
      if (errno == EINTR && termination_requested != 0) {
        return true;
      }
      if (errno == EINTR) {
        continue;
      }
      return false;
    }
    used += (size_t)received;
    if (memchr(control, '\n', used) != NULL) {
      break;
    }
  }
  control[used] = '\0';
  return strcmp(control, "CLOSE\n") == 0 || strcmp(control, "CLOSE\r\n") == 0;
}

static void print_error(const char *code) {
  (void)fprintf(stdout, "ERROR:%s\n", code);
  (void)fflush(stdout);
}

static bool bounded_path(const char *candidate) {
  if (candidate == NULL || candidate[0] != '/') {
    return false;
  }
  const size_t length = strnlen(candidate, MAX_CONFIG_PATH_BYTES + 1U);
  return length > 0U && length <= MAX_CONFIG_PATH_BYTES;
}

static int validate_uid_marker(const char *candidate, uid_t uid) {
  if (!bounded_path(candidate)) {
    errno = EINVAL;
    return -1;
  }
  const int descriptor = open(candidate, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (descriptor < 0) {
    return -1;
  }
  struct stat metadata;
  if (fstat(descriptor, &metadata) != 0) {
    const int saved_errno = errno;
    (void)close(descriptor);
    errno = saved_errno;
    return -1;
  }
  if (!S_ISREG(metadata.st_mode) || metadata.st_uid != 0 || metadata.st_nlink != 1
      || (metadata.st_mode & (S_IWGRP | S_IWOTH)) != 0) {
    (void)close(descriptor);
    errno = EPERM;
    return -1;
  }
  char expected[96];
  const int expected_length = snprintf(
    expected,
    sizeof(expected),
    "opencode-quality-exclusive-uid-v1:%u\n",
    (unsigned int)uid
  );
  if (expected_length < 1 || (size_t)expected_length >= sizeof(expected)
      || metadata.st_size != (off_t)expected_length) {
    (void)close(descriptor);
    errno = EINVAL;
    return -1;
  }
  char observed[96];
  const ssize_t received = read(descriptor, observed, sizeof(observed));
  const int saved_errno = errno;
  (void)close(descriptor);
  if (received != expected_length || memcmp(observed, expected, (size_t)expected_length) != 0) {
    errno = received < 0 ? saved_errno : EINVAL;
    return -1;
  }
  return 0;
}

static int acquire_uid_lease(const char *candidate, uid_t uid) {
  if (!bounded_path(candidate)) {
    errno = EINVAL;
    return -1;
  }
  const int descriptor = open(candidate, O_RDWR | O_CLOEXEC | O_NOFOLLOW);
  if (descriptor < 0) {
    return -1;
  }
  struct stat metadata;
  if (fstat(descriptor, &metadata) != 0) {
    const int saved_errno = errno;
    (void)close(descriptor);
    errno = saved_errno;
    return -1;
  }
  const mode_t lease_permissions = metadata.st_mode
    & (S_ISUID | S_ISGID | S_ISVTX | S_IRWXU | S_IRWXG | S_IRWXO);
  if (!S_ISREG(metadata.st_mode) || metadata.st_uid != uid || metadata.st_nlink != 1
      || lease_permissions != (S_IRUSR | S_IWUSR)) {
    (void)close(descriptor);
    errno = EPERM;
    return -1;
  }
  if (flock(descriptor, LOCK_EX | LOCK_NB) != 0) {
    const int saved_errno = (errno == EWOULDBLOCK || errno == EAGAIN) ? EBUSY : errno;
    (void)close(descriptor);
    errno = saved_errno;
    return -1;
  }
  return descriptor;
}

static bool lease_matches_marker(const char *marker_path, const char *lease_path) {
  if (!bounded_path(marker_path) || !bounded_path(lease_path)) {
    return false;
  }
  const size_t marker_length = strnlen(marker_path, MAX_CONFIG_PATH_BYTES + 1U);
  static const char suffix[] = ".lease";
  const size_t suffix_length = sizeof(suffix) - 1U;
  const size_t lease_length = strnlen(lease_path, MAX_CONFIG_PATH_BYTES + 1U);
  return marker_length + suffix_length == lease_length
    && memcmp(marker_path, lease_path, marker_length) == 0
    && memcmp(&lease_path[marker_length], suffix, suffix_length) == 0;
}

static const char *scope_error_code(int error_number) {
  switch (error_number) {
    case EBUSY:
      return "exclusive_uid_not_available";
    case EPERM:
      return "scope_permission_failed";
    case ESRCH:
      return "scope_identity_failed";
    case E2BIG:
      return "scope_bound_exceeded";
    case ELOOP:
      return "scope_ancestry_invalid";
    default:
      return "scope_census_failed";
  }
}

static int install_signal_handlers(void) {
  struct sigaction action;
  memset(&action, 0, sizeof(action));
  action.sa_handler = request_termination;
  if (sigemptyset(&action.sa_mask) != 0) {
    return -1;
  }
  if (sigaction(SIGTERM, &action, NULL) != 0
      || sigaction(SIGINT, &action, NULL) != 0
      || sigaction(SIGHUP, &action, NULL) != 0
      || signal(SIGPIPE, SIG_IGN) == SIG_ERR) {
    return -1;
  }
  return 0;
}

int main(int argc, char **argv) {
  if (install_signal_handlers() != 0) {
    return 1;
  }
  bool probe = false;
  pid_t worker_pid = 0;
  pid_t coordinator_pid = 0;
  uint64_t timeout_milliseconds = 0;
  const char *marker_path = NULL;
  const char *lease_path = NULL;
  int64_t parsed = 0;
  if (argc == 6 && strcmp(argv[1], "probe") == 0
      && parse_positive_integer(argv[2], INT32_MAX, &parsed)) {
    probe = true;
    coordinator_pid = (pid_t)parsed;
    if (!parse_positive_integer(argv[3], 120000, &parsed)) {
      print_error("arguments_invalid");
      return 64;
    }
    timeout_milliseconds = (uint64_t)parsed;
    marker_path = argv[4];
    lease_path = argv[5];
  } else if (argc == 7 && strcmp(argv[1], "watch") == 0
      && parse_positive_integer(argv[2], INT32_MAX, &parsed)) {
    worker_pid = (pid_t)parsed;
    if (!parse_positive_integer(argv[3], INT32_MAX, &parsed)) {
      print_error("arguments_invalid");
      return 64;
    }
    coordinator_pid = (pid_t)parsed;
    if (!parse_positive_integer(argv[4], 120000, &parsed)) {
      print_error("arguments_invalid");
      return 64;
    }
    timeout_milliseconds = (uint64_t)parsed;
    marker_path = argv[5];
    lease_path = argv[6];
  } else {
    print_error("arguments_invalid");
    return 64;
  }

  const uid_t workload_uid = getuid();
  if (!lease_matches_marker(marker_path, lease_path)) {
    print_error("uid_lease_invalid");
    return 77;
  }
  if (validate_uid_marker(marker_path, workload_uid) != 0) {
    print_error("uid_marker_invalid");
    return 77;
  }
  const int lease_descriptor = acquire_uid_lease(lease_path, workload_uid);
  if (lease_descriptor < 0) {
    print_error(errno == EBUSY ? "exclusive_uid_not_available" : "uid_lease_invalid");
    return 77;
  }

  struct controller_scope scope;
  memset(&scope, 0, sizeof(scope));
  if (capture_scope(coordinator_pid, worker_pid, probe, &scope) != 0) {
    const int saved_errno = errno;
    (void)close(lease_descriptor);
    errno = saved_errno;
    print_error(scope_error_code(errno));
    return 77;
  }
  uint64_t preparation_scans = 0;
  size_t preparation_zombies = 0;
  if (terminate_scope(
      &scope,
      timeout_milliseconds,
      !probe,
      &preparation_scans,
      &preparation_zombies
    ) != 0) {
    const int saved_errno = errno;
    (void)close(lease_descriptor);
    print_error(saved_errno == ETIMEDOUT ? "uid_preparation_timeout" : "uid_preparation_failed");
    return 77;
  }
  if (preparation_zombies != 0U) {
    (void)close(lease_descriptor);
    print_error("uid_preparation_failed");
    return 77;
  }
  if (assert_exclusive_scope(&scope, !probe) != 0) {
    const int saved_errno = errno;
    (void)close(lease_descriptor);
    print_error(saved_errno == EBUSY ? "uid_preparation_failed" : scope_error_code(saved_errno));
    return 77;
  }
  if (probe) {
    (void)fprintf(
      stdout,
      "PROBE:%d:%u:%d:%" PRId64 ":%d:%zu:%" PRIu64 "\n",
      CONTROLLER_PROTOCOL_VERSION,
      (unsigned int)scope.uid,
      scope.self.pid,
      scope.self.start_seconds,
      scope.self.start_microseconds,
      scope.ancestor_count,
      preparation_scans
    );
    (void)fflush(stdout);
    (void)close(lease_descriptor);
    return 0;
  }

  (void)fprintf(
    stdout,
    "READY:%d:%u:%d:%" PRId64 ":%d:%d:%" PRId64 ":%d:%zu:%" PRIu64 "\n",
    CONTROLLER_PROTOCOL_VERSION,
    (unsigned int)scope.uid,
    scope.worker.pid,
    scope.worker.start_seconds,
    scope.worker.start_microseconds,
    scope.self.pid,
    scope.self.start_seconds,
    scope.self.start_microseconds,
    scope.ancestor_count,
    preparation_scans
  );
  (void)fflush(stdout);

  const bool valid_close = read_close_request();
  uint64_t scans = 0;
  size_t zombies = 0;
  if (terminate_scope(&scope, timeout_milliseconds, false, &scans, &zombies) != 0) {
    const int saved_errno = errno;
    (void)close(lease_descriptor);
    print_error(saved_errno == ETIMEDOUT ? "uid_teardown_timeout" : "uid_teardown_failed");
    return 1;
  }
  if (!valid_close) {
    (void)close(lease_descriptor);
    print_error("control_protocol_failed");
    return 1;
  }
  (void)fprintf(
    stdout,
    "CLOSED:%d:%" PRIu64 ":%zu\n",
    CONTROLLER_PROTOCOL_VERSION,
    scans,
    zombies
  );
  (void)fflush(stdout);
  (void)close(lease_descriptor);
  return 0;
}
