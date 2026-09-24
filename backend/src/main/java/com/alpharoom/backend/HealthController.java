package com.alpharoom.backend;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Endpoint de sante minimal - sert a valider que la chaine
 * build -> tests -> Docker -> CI fonctionne de bout en bout.
 * A remplacer/completer par les vrais controllers du projet
 * (marche, portefeuille, IA, stress testing, etc.).
 */
@RestController
public class HealthController {

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "UP", "service", "AlphaRoom backend");
    }
}
