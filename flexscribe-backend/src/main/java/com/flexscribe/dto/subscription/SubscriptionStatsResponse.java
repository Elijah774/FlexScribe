package com.flexscribe.dto.subscription;

import lombok.Builder;
import lombok.Data;

@Data @Builder
public class SubscriptionStatsResponse {
    private long activeCount;
    private long totalCount;
    private Double monthlyTotal;
    private Double annualTotal;
}
