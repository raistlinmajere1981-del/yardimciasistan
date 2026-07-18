package com.yardimciasistan.android;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class NotificationLedger {
  final Map<String, Record> records = new LinkedHashMap<>();

  Update synchronize(
      List<NotificationEvent> previousEvents,
      List<NotificationEvent> currentEvents,
      Set<String> previouslyEligible,
      Set<String> currentlyEligible,
      boolean hadPreviousSnapshot,
      boolean canPost,
      long now
  ) {
    Map<String, NotificationEvent> previousByKey = byKey(previousEvents);
    Map<String, NotificationEvent> currentByKey = byKey(currentEvents);
    Update update = new Update();

    for (Record record : records.values()) {
      if (record.eventKey.startsWith("sync:error:")) {
        continue;
      }
      if (record.clearedAt == 0L && !currentByKey.containsKey(record.eventKey)) {
        record.clearedAt = now;
        if (record.notifiedAt > 0L) {
          update.cancelKeys.add(record.eventKey);
        }
      }
    }

    for (NotificationEvent event : currentEvents) {
      boolean previousActive = previousByKey.containsKey(event.key);
      boolean previousAllowed = previouslyEligible.contains(event.key);
      boolean currentAllowed = currentlyEligible.contains(event.key);
      Record record = records.get(event.key);
      if (record == null) {
        boolean newOccurrence = hadPreviousSnapshot && !previousActive;
        boolean eligibilityOpened = hadPreviousSnapshot && previousActive && !previousAllowed && currentAllowed;
        record = new Record(event.key, now, 0L, 0L, !newOccurrence && !eligibilityOpened);
        records.put(event.key, record);
        if (canPost && currentAllowed && (newOccurrence || eligibilityOpened)) {
          update.notifyEvents.add(event);
        }
        continue;
      }

      boolean reactivated = record.clearedAt > 0L;
      if (reactivated) {
        record.clearedAt = 0L;
        if (record.notifiedAt == 0L) {
          record.baselineOnly = false;
        }
      }
      if (!currentAllowed) {
        if (record.notifiedAt > 0L) {
          update.cancelKeys.add(event.key);
        }
        continue;
      }
      if (record.notifiedAt == 0L
          && canPost
          && (!record.baselineOnly || !previousAllowed || reactivated)) {
        update.notifyEvents.add(event);
      }
    }
    return update;
  }

  Update activate(NotificationEvent event, boolean allowed, boolean canPost, long now) {
    Update update = new Update();
    Record record = records.get(event.key);
    if (record == null) {
      record = new Record(event.key, now, 0L, 0L, false);
      records.put(event.key, record);
    }
    if (!allowed) {
      if (record.clearedAt == 0L) {
        record.clearedAt = now;
        if (record.notifiedAt > 0L) {
          update.cancelKeys.add(event.key);
        }
      }
      return update;
    }
    if (record.clearedAt > 0L) {
      record.clearedAt = 0L;
      record.notifiedAt = 0L;
      record.baselineOnly = false;
    }
    if (canPost && record.notifiedAt == 0L) {
      update.notifyEvents.add(event);
    }
    return update;
  }

  Set<String> clearPrefix(String prefix, long now) {
    HashSet<String> cancelKeys = new HashSet<>();
    for (Record record : records.values()) {
      if (record.eventKey.startsWith(prefix) && record.clearedAt == 0L) {
        record.clearedAt = now;
        if (record.notifiedAt > 0L) {
          cancelKeys.add(record.eventKey);
        }
      }
    }
    return cancelKeys;
  }

  void markNotified(Collection<NotificationEvent> events, long now) {
    for (NotificationEvent event : events) {
      Record record = records.get(event.key);
      if (record != null && record.notifiedAt == 0L) {
        record.notifiedAt = now;
        record.baselineOnly = false;
      }
    }
  }

  private static Map<String, NotificationEvent> byKey(List<NotificationEvent> events) {
    HashMap<String, NotificationEvent> result = new HashMap<>();
    if (events != null) {
      for (NotificationEvent event : events) {
        result.put(event.key, event);
      }
    }
    return result;
  }

  static final class Record {
    final String eventKey;
    final long firstSeenAt;
    long notifiedAt;
    long clearedAt;
    boolean baselineOnly;

    Record(String eventKey, long firstSeenAt, long notifiedAt, long clearedAt, boolean baselineOnly) {
      this.eventKey = eventKey;
      this.firstSeenAt = firstSeenAt;
      this.notifiedAt = notifiedAt;
      this.clearedAt = clearedAt;
      this.baselineOnly = baselineOnly;
    }
  }

  static final class Update {
    final List<NotificationEvent> notifyEvents = new ArrayList<>();
    final Set<String> cancelKeys = new HashSet<>();
  }
}
