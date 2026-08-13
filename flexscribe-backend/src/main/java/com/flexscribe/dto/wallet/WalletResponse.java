package com.flexscribe.dto.wallet;

import lombok.Builder;
import lombok.Data;

@Data @Builder
public class WalletResponse {
    private Integer walletID;
    private Double balance;
    private Double pendingIn;
    private Double pendingOut;
    private String currency;
}
