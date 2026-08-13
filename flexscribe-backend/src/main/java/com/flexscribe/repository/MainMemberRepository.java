package com.flexscribe.repository;

import com.flexscribe.model.MainMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface MainMemberRepository extends JpaRepository<MainMember, Integer> {
}
