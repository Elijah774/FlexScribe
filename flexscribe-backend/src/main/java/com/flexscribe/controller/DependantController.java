package com.flexscribe.controller;

import com.flexscribe.dto.ApiResponse;
import com.flexscribe.dto.dependant.DependantRequest;
import com.flexscribe.dto.wallet.FundsRequest;
import com.flexscribe.model.Dependant;
import com.flexscribe.security.CurrentUser;
import com.flexscribe.service.DependantService;
import com.flexscribe.service.WalletService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/dependants")
public class DependantController {

    @Autowired private DependantService dependantService;
    @Autowired private WalletService walletService;

    @GetMapping
    public ResponseEntity<List<Dependant>> getAll() {
        return ResponseEntity.ok(dependantService.getAllByMainMember(CurrentUser.getId()));
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody DependantRequest req) {
        try {
            Dependant dep = dependantService.create(CurrentUser.getId(), req);
            return ResponseEntity.status(HttpStatus.CREATED).body(dep);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiResponse.error(e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Integer id, @RequestBody DependantRequest req) {
        try {
            Dependant dep = dependantService.update(id, CurrentUser.getId(), req);
            return ResponseEntity.ok(dep);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        try {
            dependantService.delete(id, CurrentUser.getId());
            return ResponseEntity.ok(ApiResponse.ok("Dependant removed"));
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/{id}/send-allowance")
    public ResponseEntity<?> sendAllowance(@PathVariable Integer id, @Valid @RequestBody FundsRequest req) {
        try {
            walletService.sendToDependant(CurrentUser.getId(), req.getAmount(), id, null);
            return ResponseEntity.ok(ApiResponse.ok("Allowance sent"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
        }
    }
}
