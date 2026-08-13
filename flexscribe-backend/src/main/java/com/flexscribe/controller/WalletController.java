package com.flexscribe.controller;

import com.flexscribe.dto.ApiResponse;
import com.flexscribe.dto.wallet.FundsRequest;
import com.flexscribe.dto.wallet.WalletResponse;
import com.flexscribe.model.VirtualWallet;
import com.flexscribe.model.WalletTransaction;
import com.flexscribe.security.CurrentUser;
import com.flexscribe.service.WalletService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/wallet")
public class WalletController {

    @Autowired private WalletService walletService;

    @GetMapping
    public ResponseEntity<WalletResponse> getWallet() {
        VirtualWallet w = walletService.getWallet(CurrentUser.getId());
        WalletResponse resp = WalletResponse.builder()
                .walletID(w.getWalletID())
                .balance(w.getBalance())
                .pendingIn(w.getPendingIn())
                .pendingOut(w.getPendingOut())
                .currency(w.getCurrency())
                .build();
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/transactions")
    public ResponseEntity<List<WalletTransaction>> getTransactions() {
        return ResponseEntity.ok(walletService.getTransactions(CurrentUser.getId()));
    }

    @GetMapping("/transactions/recent")
    public ResponseEntity<List<WalletTransaction>> getRecentTransactions() {
        return ResponseEntity.ok(walletService.getRecentTransactions(CurrentUser.getId()));
    }

    @PostMapping("/add-funds")
    public ResponseEntity<?> addFunds(@Valid @RequestBody FundsRequest req) {
        try {
            VirtualWallet w = walletService.addFunds(CurrentUser.getId(), req.getAmount(), req.getSource());
            return ResponseEntity.ok(ApiResponse.ok("Funds added", w.getBalance()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/withdraw")
    public ResponseEntity<?> withdraw(@Valid @RequestBody FundsRequest req) {
        try {
            VirtualWallet w = walletService.withdraw(CurrentUser.getId(), req.getAmount(), req.getDestination());
            return ResponseEntity.ok(ApiResponse.ok("Withdrawal successful", w.getBalance()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/transfer-to-goal")
    public ResponseEntity<?> transferToGoal(@Valid @RequestBody FundsRequest req) {
        try {
            VirtualWallet w = walletService.transferToGoal(CurrentUser.getId(), req.getAmount(), req.getGoalID(), null);
            return ResponseEntity.ok(ApiResponse.ok("Transferred to goal", w.getBalance()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/send-to-dependant")
    public ResponseEntity<?> sendToDependant(@Valid @RequestBody FundsRequest req) {
        try {
            VirtualWallet w = walletService.sendToDependant(CurrentUser.getId(), req.getAmount(), req.getDependantID(), null);
            return ResponseEntity.ok(ApiResponse.ok("Sent to dependant", w.getBalance()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        }
    }
}
