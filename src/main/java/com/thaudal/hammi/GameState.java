package com.thaudal.hammi;

import javafx.stage.Stage;

public class GameState {
    private Stage stage;
    private Pet pet;

    public GameState(Stage stage) {
        this.stage = stage;
    }

    public Stage getStage() {
        return stage;
    }

    public void setPet(Pet pet) {
        this.pet = pet;
    }

    public Pet getPet() {
        return pet;
    }
}
