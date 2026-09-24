# --- Stage 1 : build --------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace

# Cache des dependances : copie du pom.xml seul d'abord
COPY pom.xml .
RUN mvn -B dependency:go-offline

COPY src ./src
# Les tests sont deja executes en amont dans le job CI -> on les saute ici
RUN mvn -B clean package -DskipTests

# --- Stage 2 : runtime --------------------------------------------------
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

RUN addgroup -S spring && adduser -S spring -G spring
COPY --from=build /workspace/target/app.jar app.jar
RUN chown spring:spring app.jar
USER spring

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
