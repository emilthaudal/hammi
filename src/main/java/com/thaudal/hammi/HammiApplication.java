package com.thaudal.hammi;

import javafx.animation.AnimationTimer;
import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Group;
import javafx.scene.Scene;
import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.stage.Stage;

import java.io.IOException;

public class HammiApplication extends Application {
    @Override
    public void start(Stage stage) throws IOException {
        GameState state = new GameState(stage);
        runMainScene(state);
    }

    public void runMainScene(GameState state) {
        Stage stage = state.getStage();
        Group root = new Group();
        stage.setTitle("Hammi");
        Scene mainScene = new Scene(root);
        stage.setScene(mainScene);

        Canvas canvas = new Canvas( 500, 500 );

        root.getChildren().add(canvas);

        GraphicsContext gc = canvas.getGraphicsContext2D();

        new AnimationTimer()
        {
            public void handle(long currentNanoTime)
            {

            }
        }.start();


        stage.show();
    }

    public static void main(String[] args) {
        launch();
    }
}